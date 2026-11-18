// KOSMOS — ARC COLONY SPHERE, kroki CS-3b + CS-3b-v2: archetypy ciał (dane + selektor, bez zmiany wyglądu).
// Plan: docs/design/COLONY_SPHERE_PLAN.md §0b (D-CS-1 zrewidowane / 2 / 3 / 5 / 8), §2, §3.3.
// CS-3b-v2: wybór z fizycznych driverów (strumień S = L/a², atmosfera, H2O, masa, rodzic, strefa księżyca),
// 11 planet + 3 gaz + 5 księżyców + 2 planetoidy, terran z zamrożonym waterBand + waterCoverage, domy imperiów terran.
//
// A1  Dane: lista v2 (11 planet + 5 księżyców + 2 planetoidy + 3 gaz; toxic → hothouse), id unikalne, każda rodzina ma fallback
//     bez warunków, biomy → tylko 10 terenów rozgrywki (D-CS-3), GRID_TILE_COUNTS = D-CS-8 i 10n²+2,
//     STAR_CLASS_MASS / STAR_CLASS_LUMINOSITY = STAR_TYPES, FLUX_HZ_OUTER = L/hz.max² każdej klasy, WATER_BANDS,
//     gasPreset ∈ GAS_PRESETS, klucze i18n PL + EN (bez starego toxic).
// A2  Selektor: totalny (siatka parametrów × ziarna) i rodzina = typ ciała; deterministyczny; remis rozstrzyga
//     WYŁĄCZNIE surfaceSeed (oba warianty występują, kontekst gwiazdy/nazwa nie zmienia wyniku); bez remisu ziarno
//     nie ma wpływu; reguły punktowe v2 (strumień, rodzic, strefa księżyca, planetoidy lodowe, progi gazu).
// A3  tidallyLocked: reguła a < 0.85·∛M_klasy (planeta), księżyc/planetoida false, czysta (0 rzutów Math.random).
// A4  Zamrożenie (D-CS-2): dryf parametrów nie zmienia archetypu ani waterBand / waterCoverage; id spoza tabeli
//     (toxic, rocky_moon, icy_moon z v1) → wybór od nowa; homeworld → terran; pasma wody: czysty hash, podział 60/25/15.
// A5  Ścieżka świata (StarSystemManager): każde ciało ma archetyp + tidallyLocked; = select(parametry z generacji);
//     0 rzutów Math.random w nadawaniu; świat seedowany przed/po krokiem identyczny poza nowymi polami
//     (ślad traces/CS3b-world-baseline.json nagrany TYM plikiem z --record na worktree bazy).
// A6  GasGiantShader: uniformy bake'u identyczne ze śladem bazy i niezależne od pól CS-3b.
// A7  Kontrola: ślad OFF CS-3a (generator) nadal bit w bit.
// A8  GameCore.boot (OFF i ON): każde ciało z archetypem; dom gracza terran; domy AI habitowalne i wybrane z
//     parametrów PO makeHomeworldBreathable; zapis niesie pola, odczyt (replika _restoreSystem) stabilny; piny źródła.
// A9  Kanoniczny fixture (v101): świadek braku pól, `??=` nadaje KAŻDEMU ciału, zapis + odczyt stabilny, drugi pass 0.
// A10 Pomocniki konsoli: csWorlds() kolumny archetype/tidallyLocked/waterBand/waterCoverage/palette, csArchetypes() spis
//     wszystkich 21 archetypów + palety planetoid + pasma wody.
// A11 Galaktyka headless (5 seedów × 72 układy, sonda probe-cs3b-archetypes): planeta ≤ 35%, księżyc ≤ 45%, każdy
//     archetyp w ≥ 3 galaktykach (poza gas_warm, ocean), pasma wody terran 60/25/15 ± 7 pp, domy imperiów terran.
//
// Tryb nagrania (tylko na worktree bazy): node colony_sphere_archetypes_smoke.mjs --record <plik.json>

import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as envNs from '../headless/env.js';

globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };

const { GAME_CONFIG, STAR_TYPES } = await import('../../config/GameConfig.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const gasNs                 = await import('../headless/GasUniformsDigest.mjs');
const BASELINE_URL = new URL('../fixtures/traces/CS3b-world-baseline.json', import.meta.url);
const SRC_ROOT = new URL('../../', import.meta.url);

// ── Odcisk świata: ta sama ścieżka gry po obu stronach (baza / krok), pola CS-3b pominięte ──────────────
const CS3B_KEYS = new Set(['tidallyLocked', 'bodyArchetype', 'waterBand', 'waterCoverage']);
const WORLD_SEEDS = [-2102099243, 813683454, 1640489291];
const WORLD_FOREIGN = 8;   // pierwsze N obcych gwiazd galaktyki (generateAndRegister)
function canonical(value, skip, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return `"${String(value)}"`;
    if (typeof value === 'function' || value === undefined) return 'null';
    return JSON.stringify(value);
  }
  if (seen.has(value)) return '"[cycle]"';
  seen.add(value);
  let out;
  if (Array.isArray(value)) out = '[' + value.map(v => canonical(v, skip, seen)).join(',') + ']';
  else {
    const keys = Object.keys(value).filter(k => !skip.has(k) && typeof value[k] !== 'function').sort();
    out = '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(value[k], skip, seen)).join(',') + '}';
  }
  seen.delete(value);
  return out;
}
function buildWorld(seed) {
  EntityManager.clear();
  envNs.reseed('cs3b-world-' + seed);
  const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const gd = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true });
  ssm.assignMissingSurfaceSeeds(gd.seed);
  if (typeof ssm.assignMissingArchetypes === 'function') ssm.assignMissingArchetypes();
  const foreign = gd.systems.filter(s => s.id !== 'sys_home').slice(0, WORLD_FOREIGN);
  for (const gs of foreign) ssm.generateAndRegister(gs, gd);
  return { home, ssm, gd };
}
function worldBodies() {
  return ['star', 'planet', 'moon', 'planetoid'].flatMap(k => EntityManager.getByType(k));
}
function worldDigest(seed) {
  buildWorld(seed);
  const bodies = worldBodies();
  const json = canonical(bodies, CS3B_KEYS);
  const keys = new Set(bodies.flatMap(b => Object.keys(b)));
  return { sha256: createHash('sha256').update(json).digest('hex'), bodies: bodies.length, keys: [...keys].sort() };
}

// ── Tryb nagrania ────────────────────────────────────────────────────────────
const recIdx = process.argv.indexOf('--record');
if (recIdx >= 0) {
  const out = process.argv[recIdx + 1];
  if (!out) { console.error('--record wymaga ścieżki'); process.exit(2); }
  const world = {};
  for (const s of WORLD_SEEDS) world[s] = worldDigest(s);
  const gas = await gasNs.gasUniformsDigest(SRC_ROOT);
  const doc = {
    recordedFrom: process.env.CS3B_BASELINE_COMMIT ?? '(unset)',
    schema: { worldSeeds: WORLD_SEEDS, worldForeign: WORLD_FOREIGN, smallBodies: GAME_CONFIG.FEATURES.smallBodies,
              gasBodies: gasNs.GAS_DIGEST_BODIES.map(b => b.id) },
    world, gas,
  };
  writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log('recorded →', out, gas.err ?? '');
  process.exit(0);
}

let pass = 0, fail = 0;
function assert(cond, label) { if (cond) { console.log('  ✓ ' + label); pass++; } else { console.log('  ✗ ' + label); fail++; } }
function header(t) { console.log('\n--- ' + t + ' ---'); }
function strip(src) {
  return String(src).replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}
function readSrc(rel) { try { return strip(readFileSync(new URL(rel, import.meta.url), 'utf8')); } catch { return ''; } }
function withFlag(v, fn) {
  const prev = GAME_CONFIG.FEATURES.seededSystems;
  GAME_CONFIG.FEATURES.seededSystems = v;
  try { return fn(); } finally { GAME_CONFIG.FEATURES.seededSystems = prev; }
}
async function tryImport(rel) { try { return await import(rel); } catch (e) { return { __err: String(e?.message ?? e) }; } }
function countDraws(fn) {
  const orig = Math.random;
  let n = 0;
  Math.random = () => { n++; return orig(); };
  try { const r = fn(); return { n, r }; } finally { Math.random = orig; }
}

// Importy przez przestrzeń nazw — piny degradują się (czerwień), nie przerywają, gdy symbolu jeszcze nie ma.
const DA = await tryImport('../../data/BodyArchetypes.js');
const BL = await tryImport('../../utils/BodyArchetypeLogic.js');
const fnOr = (ns, name) => (typeof ns[name] === 'function' ? ns[name] : null);
const select = fnOr(BL, 'select'), bodyParamsOf = fnOr(BL, 'bodyParamsOf'), familyOf = fnOr(BL, 'familyOf');
const deriveTidallyLocked = fnOr(BL, 'deriveTidallyLocked'), assignBodyArchetype = fnOr(BL, 'assignBodyArchetype');
const candidatesFor = fnOr(BL, 'candidatesFor'), gridClassFor = fnOr(BL, 'gridClassFor');
const archetypeContext = fnOr(BL, 'archetypeContext'), waterBandOf = fnOr(BL, 'waterBandOf'), fluxOf = fnOr(BL, 'fluxOf');
const planetoidPaletteOf = fnOr(BL, 'planetoidPaletteOf'), moonZoneOfRank = fnOr(BL, 'moonZoneOfRank');
// Kontekst układu z EntityManager (gwiazda + planety + księżyce danego systemId) — jak StarSystemManager.
function sysCtx(sid) {
  if (!archetypeContext) return null;
  const inSys = (k) => EntityManager.getByType(k).filter(b => (b.systemId ?? 'sys_home') === sid);
  return archetypeContext(inSys('star')[0] ?? null, inSys('planet'), inSys('moon'));
}
const selectInWorld = (b) => { const c = sysCtx(b.systemId ?? 'sys_home'); return select(bodyParamsOf(b, c), c, b.surfaceSeed); };
const ROWS = Array.isArray(DA.BODY_ARCHETYPES) ? DA.BODY_ARCHETYPES : [];
const BY_ID = DA.ARCHETYPE_BY_ID ?? {};
const KINDS = ['planet', 'moon', 'planetoid'];
const HABITABLE = new Set(['terran', 'ocean', 'jungle']);
const P = (o) => ({ kind: 'planet', planetType: 'rocky', moonType: null, planetoidType: null, tempC: 15, atmosphere: 'thin',
                    h2o: 1, mass: 1, lifeScore: 0, tidallyLocked: false, flux: 0.8, parentType: null, moonZone: null, ...o });
const MOON = (o) => P({ kind: 'moon', planetType: null, moonType: 'rocky', atmosphere: 'none', tempC: -150, h2o: 0, flux: 0.01, ...o });

// ── A1 ───────────────────────────────────────────────────────────────────────
header('A1: dane archetypów (D-CS-1 v2 / D-CS-3 / D-CS-8)');
{
  assert(!DA.__err && !BL.__err, `moduły importują się pod node (${DA.__err ?? ''}${BL.__err ?? ''})`);
  const ids = ROWS.map(r => r.id);
  const want = {
    planet: ['terran', 'ocean', 'jungle', 'desert', 'ice', 'volcanic', 'hothouse', 'cryo_haze', 'scorched', 'barren', 'tidally_locked'],
    moon: ['rocky_cratered', 'volcanic_moon', 'icy_cracked', 'icy_cratered', 'hazy_moon'], planetoid: ['planetoid', 'planetoid_icy'],
    gas: ['gas_warm', 'gas_temperate', 'gas_cold'],
  };
  for (const [fam, list] of Object.entries(want)) {
    const got = ROWS.filter(r => r.family === fam).map(r => r.id).sort();
    assert(JSON.stringify(got) === JSON.stringify([...list].sort()), `rodzina ${fam}: ${got.join(', ')}`);
  }
  assert(ids.length === 21 && new Set(ids).size === ids.length, `21 archetypów, id unikalne (${ids.length})`);
  assert(ids.filter(id => !id.startsWith('gas_')).length === 18, 'D-CS-1 v2: 18 archetypów powierzchni (11 + 5 + 2)');
  for (const fam of ['planet', 'gas', 'moon', 'planetoid']) {
    const fb = ROWS.filter(r => r.family === fam).flatMap(r => r.match.filter(c => Object.keys(c).length === 1 && c.priority === 0));
    assert(fb.length === 1, `rodzina ${fam}: dokładnie jedna klauzula fallback (bez warunków, priority 0)`);
  }
  const { TERRAIN_TYPES } = await import('../../map/HexTile.js');
  const terr = new Set(Object.keys(TERRAIN_TYPES));
  const biomeTerr = ROWS.flatMap(r => (r.biomes ?? []).map(b => b.terrain));
  assert(terr.size === 10 && biomeTerr.length > 40 && biomeTerr.every(t => terr.has(t)), `biomy → wyłącznie 10 terenów rozgrywki (${biomeTerr.length} wpisów)`);
  assert(ROWS.length === 21 && ROWS.every(r => (r.biomes ?? []).length >= 3), 'każdy archetyp ma ≥3 klasy biomów');
  const surf = ROWS.filter(r => r.family !== 'gas');
  assert(surf.length === 18 && surf.every(r => r.field && r.atmosphere && typeof r.atmosphere.tint === 'string' && typeof r.clouds?.coverage === 'number'),
    'każdy archetyp powierzchni ma placeholdery field / atmosphere.tint / clouds.coverage');
  const G = DA.GRID_TILE_COUNTS ?? {};
  assert(JSON.stringify([G.planetoid, G.moon, G.gas, G.hot_rocky, G.small_rocky, G.large_rocky, G.largest_cap]) === '[92,92,92,162,162,252,362]',
    `D-CS-8: GRID_TILE_COUNTS = 92/92/92/162/162/252/362 (${JSON.stringify(G)})`);
  assert(Object.values(G).length > 0 && Object.values(G).every(n => Number.isInteger(Math.sqrt((n - 2) / 10))), 'każda liczba kafli = 10n²+2');
  assert(ROWS.length === 21 && ROWS.every(r => r.gridClass === 'by_mass' || r.gridClass in G), 'gridClass: by_mass albo klucz GRID_TILE_COUNTS');
  if (gridClassFor) {
    assert(gridClassFor('terran', { planetType: 'rocky', physics: { mass: 1.0 } }) === 'small_rocky'
        && gridClassFor('terran', { planetType: 'rocky', physics: { mass: 2.0 } }) === 'large_rocky'
        && gridClassFor('ice', { planetType: 'ice', physics: { mass: 10 } }) === 'small_rocky'
        && gridClassFor('volcanic', { planetType: 'hot_rocky', physics: { mass: 3 } }) === 'hot_rocky'
        && gridClassFor('rocky_cratered', {}) === 'moon' && gridClassFor('hazy_moon', {}) === 'moon' && gridClassFor('gas_cold', {}) === 'gas'
        && gridClassFor('planetoid', {}) === 'planetoid' && gridClassFor('planetoid_icy', {}) === 'planetoid',
      'gridClassFor: klasa rozmiaru D-CS-8 z typu i masy (≤1.5 M⊕ small, >1.5 large)');
  } else assert(false, 'gridClassFor dostępne');
  const sm = DA.STAR_CLASS_MASS ?? {};
  assert(Object.keys(STAR_TYPES).length === Object.keys(sm).length && Object.entries(STAR_TYPES).every(([k, v]) => sm[k] === v.mass),
    `STAR_CLASS_MASS = STAR_TYPES[*].mass (${JSON.stringify(sm)})`);
  const sl = DA.STAR_CLASS_LUMINOSITY ?? {};
  assert(Object.keys(STAR_TYPES).length === Object.keys(sl).length && Object.entries(STAR_TYPES).every(([k, v]) => sl[k] === v.luminosity),
    `STAR_CLASS_LUMINOSITY = STAR_TYPES[*].luminosity (${JSON.stringify(sl)})`);
  const hzOut = Object.entries(STAR_TYPES).map(([k, v]) => [k, v.luminosity / (v.habitableZone.max ** 2)]);
  assert(hzOut.length === 4 && hzOut.every(([, s]) => Math.abs(s - DA.FLUX_HZ_OUTER) < 0.03),
    `FLUX_HZ_OUTER ${DA.FLUX_HZ_OUTER} = L/hz.max² każdej klasy ±0.03 (${hzOut.map(([k, s]) => k + ' ' + s.toFixed(3)).join(', ')})`);
  assert(Math.abs(DA.FLUX_FROST - DA.FLUX_HZ_OUTER / (2.2 * 2.2)) < 0.002 && Math.abs(DA.FLUX_KUIPER - DA.FLUX_FROST / 100) < 1e-12
      && DA.FLUX_HOT > DA.FLUX_WARM && DA.FLUX_WARM > DA.FLUX_HZ_OUTER,
    `progi strumienia: linia mrozu = HZ_OUTER/2.2² (${DA.FLUX_FROST}), Kuiper = mróz/100, HOT > WARM > HZ_OUTER`);
  const WB = Array.isArray(DA.WATER_BANDS) ? DA.WATER_BANDS : [];
  const wbOk = WB.length === 3 && WB.map(b => b.id).join() === 'continental,balanced,oceanic'
    && Math.abs(WB.reduce((s, b) => s + b.share, 0) - 1) < 1e-9 && WB[0].lo === 0.15 && WB[0].hi === 0.40 && WB[1].lo === 0.40
    && WB[1].hi === 0.65 && WB[2].lo === 0.65 && WB[2].hi === 0.90 && WB[0].share === 0.15 && WB[1].share === 0.25 && WB[2].share === 0.60;
  assert(wbOk, `WATER_BANDS: continental 15–40% (15%), balanced 40–65% (25%), oceanic 65–90% (60%) (${JSON.stringify(WB)})`);
  const gsSrc = readSrc('../../renderer/GasGiantShader.js');
  const gasRows = ROWS.filter(r => r.family === 'gas');
  assert(gasRows.length === 3 && gasRows.every(r => new RegExp(`\\b${r.gasPreset}:\\s*\\{`).test(gsSrc)), `gasPreset ∈ GAS_PRESETS (${gasRows.map(r => r.gasPreset).join(', ')})`);
  const pl = (await import('../../i18n/pl.js')).default, en = (await import('../../i18n/en.js')).default;
  const keys = ROWS.map(r => r.nameKey);
  assert(keys.length === 21 && keys.every(k => typeof k === 'string' && typeof pl[k] === 'string' && pl[k].length > 0 && typeof en[k] === 'string' && en[k].length > 0),
    'nameKey każdego archetypu istnieje w pl.js i en.js');
  assert(keys.length === 21 && keys.every(k => typeof pl[k] === 'string' && pl[k] !== en[k]), 'PL ≠ EN (przetłumaczone)');
  const oldIds = ['toxic', 'rocky_moon', 'icy_moon'];
  assert(oldIds.every(id => !BY_ID[id] && pl['archetype.' + id + '.name'] === undefined && en['archetype.' + id + '.name'] === undefined)
      && pl['archetype.hothouse.name'] && en['archetype.hothouse.name'], 'rename: toxic → hothouse, rocky_moon / icy_moon → 5 księżyców (dane + i18n bez starych kluczy)');
  const logicSrc = readSrc('../../utils/BodyArchetypeLogic.js'), dataSrc = readSrc('../../data/BodyArchetypes.js');
  assert(logicSrc.length > 0 && !/Math\.random/.test(logicSrc) && !/Math\.random/.test(dataSrc), 'pin: selektor i dane bez Math.random');
  const imps = [...logicSrc.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]).sort();
  assert(JSON.stringify(imps) === JSON.stringify(['../data/BodyArchetypes.js', './SeedMath.js']), `pin: selektor importuje tylko dane + SeedMath (${imps.join(', ')})`);
  assert(dataSrc.length > 0 && /export const BODY_ARCHETYPES/.test(dataSrc) && !/^import/m.test(dataSrc), 'pin: BodyArchetypes.js bez importów (czyste dane)');
}

// ── A2 ───────────────────────────────────────────────────────────────────────
header('A2: selektor — totalny, deterministyczny, remis = tylko surfaceSeed, reguły v2');
if (select && familyOf && candidatesFor) {
  const famOfId = Object.fromEntries(ROWS.map(r => [r.id, r.family]));
  const moonCtx = [['gas', 'inner'], ['gas', 'mid'], ['gas', 'outer'], ['ice', 'inner'], ['ice', 'outer'], ['rocky', 'inner'], [null, null]];
  const kinds = [
    ...['rocky', 'hot_rocky', 'ice', 'gas', null, 'weird'].map(pt => ({ kind: 'planet', planetType: pt })),
    ...['rocky', 'icy', null].flatMap(mt => moonCtx.map(([parentType, moonZone]) => ({ kind: 'moon', moonType: mt, parentType, moonZone }))),
    ...['metallic', 'carbonaceous', 'silicate', null].map(t => ({ kind: 'planetoid', planetoidType: t })),
  ];
  const atms = ['none', 'thin', 'breathable', 'dense', 'thick', 'weird'];
  const temps = [null, -260, -193.1, -150, -73, -20, 10, 40, 120, 400];
  const h2os = [0, 2.5, 3, 8, 30];
  const masses = [null, 0.4, 4.5, 20];
  const fluxes = [null, 0.0005, 0.05, 0.2, 0.5, 1.2, 2];
  let n = 0, total = 0, famOk = 0, det = 0;
  for (const k of kinds) for (const atmosphere of atms) for (const tempC of temps) for (const h2o of h2os)
    for (const mass of masses) for (const flux of fluxes) for (const lifeScore of [0, 60]) for (const tidallyLocked of [false, true]) {
      const p = P({ ...k, planetType: k.planetType ?? null, atmosphere, tempC, h2o, mass, flux, lifeScore, tidallyLocked });
      const seed = (n * 2654435761) >>> 0;
      const id = select(p, null, seed);
      n++;
      if (typeof id === 'string' && BY_ID[id]) total++;
      if (famOfId[id] === familyOf(p.kind, p.planetType)) famOk++;
      if (select(p, { spectralType: 'M', luminosity: 9 }, seed) === id) det++;
    }
  assert(n > 500000 && total === n, `totalny: ${total}/${n} kombinacji → poprawny archetyp`);
  assert(famOk === n, `rodzina archetypu = rodzina ciała (${famOk}/${n})`);
  assert(det === n, `deterministyczny; gwiazda działa tylko przez bodyParams (${det}/${n})`);
  // Remis: bez atmosfery, 300 °C → volcanic (świat lawy, 50) i scorched (gorący bezatmosferyczny, 50).
  const tieP = P({ atmosphere: 'none', tempC: 300, h2o: 0, mass: 1.2, flux: 0.8 });
  const c = candidatesFor(tieP);
  assert(JSON.stringify(c.ids) === '["volcanic","scorched"]', `świadek remisu: kandydaci ${JSON.stringify(c.ids)} (priority ${c.score})`);
  const seen = new Map();
  for (let s = 0; s < 64; s++) seen.set(select(tieP, null, s), (seen.get(select(tieP, null, s)) ?? 0) + 1);
  assert(seen.size === 2 && seen.has('volcanic') && seen.has('scorched'), `remis rozstrzyga surfaceSeed — oba warianty w 64 ziarnach (${JSON.stringify([...seen])})`);
  let stable = true;
  for (let s = 0; s < 64; s++) {
    const a = select(tieP, null, s);
    if (select({ ...tieP }, { spectralType: 'F' }, s) !== a || select(tieP, null, s) !== a) stable = false;
    if (bodyParamsOf && select(bodyParamsOf({ type: 'planet', planetType: 'rocky', atmosphere: 'none', temperatureC: 300, composition: { H2O: 0 },
         physics: { mass: 1.2 }, orbital: { a: 1.118 }, id: 'entity_' + s, name: 'X' + s, systemId: 'sys_00' + (s % 7) }, { luminosity: 1 }), null, s) !== a) stable = false;
  }
  assert(stable, 'remis: przy stałym ziarnie wynik nie zależy od id / nazwy / układu / gwiazdy');
  const noTie = P({ atmosphere: 'none', tempC: -100, h2o: 0.5, flux: 0.1 });
  const outs = new Set(Array.from({ length: 64 }, (_, s) => select(noTie, null, s)));
  assert(candidatesFor(noTie).ids.length === 1 && outs.size === 1, `bez remisu ziarno nie ma wpływu (${[...outs]})`);
  // Reguły punktowe v2 (strumień S w S⊕).
  const cases = [
    ['dom (breathable, lifeScore 100, poza HZ, zimny)', P({ atmosphere: 'breathable', tempC: -60, h2o: 27, lifeScore: 100, tidallyLocked: true, flux: 0.05 }), 'terran'],
    ['oddychalny w HZ (strumień 0.8)', P({ atmosphere: 'breathable', tempC: 10, h2o: 2.4, flux: 0.8 }), 'terran'],
    ['oddychalny w HZ, zapisany −30 °C (strumień wygrywa)', P({ atmosphere: 'breathable', tempC: -30, h2o: 2.6, flux: 0.6 }), 'terran'],
    ['oddychalny, dużo wody w HZ', P({ atmosphere: 'breathable', tempC: 20, h2o: 25, flux: 0.9 }), 'ocean'],
    ['oddychalny poza HZ (strumień 0.2) = śnieżka', P({ atmosphere: 'breathable', tempC: 5, h2o: 2.5, flux: 0.2 }), 'ice'],
    ['oddychalny, ciepła strona HZ, mokry', P({ atmosphere: 'breathable', tempC: 20, h2o: 2.8, flux: 1.3 }), 'jungle'],
    ['oddychalny, gorąca temperatura, mokry', P({ atmosphere: 'breathable', tempC: 45, h2o: 2.8, flux: 0.8 }), 'jungle'],
    ['oddychalny, ciepła strona HZ, suchy', P({ atmosphere: 'breathable', tempC: 30, h2o: 2.2, flux: 1.3 }), 'desert'],
    ['oddychalny w rotacji związanej zostaje ziemski', P({ atmosphere: 'breathable', tempC: 10, h2o: 2.4, tidallyLocked: true, flux: 0.8 }), 'terran'],
    ['lodowa planeta, cienka atmosfera', P({ planetType: 'ice', atmosphere: 'thin', tempC: -200, h2o: 45, mass: 8, flux: 0.01 }), 'ice'],
    ['lodowa planeta, gęsta atmosfera → Tytan', P({ planetType: 'ice', atmosphere: 'dense', tempC: -150, h2o: 45, mass: 8, flux: 0.01 }), 'cryo_haze'],
    ['skalisty, gęsta atmosfera poza HZ → Tytan', P({ atmosphere: 'thick', tempC: -40, h2o: 3, flux: 0.15 }), 'cryo_haze'],
    ['skalisty, gęsta atmosfera w HZ → Wenus', P({ atmosphere: 'dense', tempC: 20, h2o: 1, mass: 0.9, flux: 0.9 }), 'hothouse'],
    ['skalisty, mroźna woda poza HZ', P({ atmosphere: 'thin', tempC: -120, h2o: 30, flux: 0.03 }), 'ice'],
    ['Mars-like', P({ atmosphere: 'thin', tempC: -50, h2o: 1.5, mass: 0.8, flux: 0.3 }), 'desert'],
    ['bez atmosfery, słabe światło', P({ atmosphere: 'none', tempC: -100, h2o: 1, mass: 0.5, flux: 0.2 }), 'barren'],
    ['bez atmosfery, silny strumień → Merkury', P({ atmosphere: 'none', tempC: 60, h2o: 1, mass: 0.5, flux: 1.8 }), 'scorched'],
    ['rotacja związana, cienka atmosfera', P({ atmosphere: 'thin', tempC: -10, h2o: 1, tidallyLocked: true, flux: 0.8 }), 'tidally_locked'],
    ['rotacja związana, gęsta atmosfera → Wenus', P({ atmosphere: 'dense', tempC: 60, h2o: 1, tidallyLocked: true, flux: 1.2 }), 'hothouse'],
    ['super-Ziemia, cienka atmosfera', P({ atmosphere: 'thin', tempC: -30, h2o: 3, mass: 5.5, flux: 0.3 }), 'volcanic'],
    ['świat lawy z atmosferą', P({ atmosphere: 'thin', tempC: 300, h2o: 0, flux: 0.8 }), 'volcanic'],
    ['księżyc skalisty skalistej planety', MOON({ parentType: 'rocky', moonZone: 'inner' }), 'rocky_cratered'],
    ['księżyc skalisty, wewnętrzny, gaz → Io', MOON({ parentType: 'gas', moonZone: 'inner' }), 'volcanic_moon'],
    ['księżyc skalisty, zewnętrzny, gaz', MOON({ parentType: 'gas', moonZone: 'outer' }), 'rocky_cratered'],
    ['księżyc lodowy, środkowy, gaz → Europa', MOON({ moonType: 'icy', parentType: 'gas', moonZone: 'mid' }), 'icy_cracked'],
    ['księżyc lodowy, wewnętrzny, olbrzym lodowy', MOON({ moonType: 'icy', parentType: 'ice', moonZone: 'inner' }), 'icy_cracked'],
    ['księżyc lodowy, zewnętrzny, gaz → Kallisto', MOON({ moonType: 'icy', parentType: 'gas', moonZone: 'outer' }), 'icy_cratered'],
    ['księżyc z atmosferą, mroźny → Tytan', MOON({ moonType: 'icy', parentType: 'gas', moonZone: 'mid', atmosphere: 'thin', tempC: -180 }), 'hazy_moon'],
    ['księżyc bez typu → fallback', MOON({ moonType: null, tempC: null, flux: null }), 'rocky_cratered'],
    ['planetoida metaliczna, daleko', P({ kind: 'planetoid', planetType: null, planetoidType: 'metallic', atmosphere: 'none', flux: 0.0001 }), 'planetoid'],
    ['planetoida węglista, za 10× linią mrozu', P({ kind: 'planetoid', planetType: null, planetoidType: 'carbonaceous', atmosphere: 'none', flux: 0.0001 }), 'planetoid_icy'],
    ['planetoida krzemianowa, blisko', P({ kind: 'planetoid', planetType: null, planetoidType: 'silicate', atmosphere: 'none', flux: 0.01 }), 'planetoid'],
  ];
  for (const [label, p, want] of cases) assert(select(p, null, 7) === want, `${label} → ${want} (jest ${select(p, null, 7)})`);
  // Gaz: progi = resolveTextureType (>−73 warm, <−193 cold, ostre; brak temperatury → gas_giant).
  const gasCases = [[-40, 'gas_warm'], [-73, 'gas_temperate'], [-72.9, 'gas_warm'], [-120, 'gas_temperate'], [-193, 'gas_temperate'], [-193.1, 'gas_cold'], [null, 'gas_temperate']];
  const gasOk = gasCases.every(([t, want]) => select(P({ planetType: 'gas', tempC: t, atmosphere: 'none' }), null, 3) === want);
  assert(gasOk, `gaz: progi presetów jak resolveTextureType (${gasCases.map(([t, w]) => `${t}→${w}`).join(', ')})`);
  const ptu = readSrc('../../renderer/PlanetTextureUtils.js');
  assert(/if \(tempC > -73\)\s+return 'gas_warm'/.test(ptu) && /if \(tempC < -193\) return 'gas_cold'/.test(ptu), 'pin: progi resolveTextureType nadal −73 / −193 (źródło lustra)');
  const presetOf = Object.fromEntries(ROWS.filter(r => r.family === 'gas').map(r => [r.id, r.gasPreset]));
  assert(presetOf.gas_warm === 'gas_warm' && presetOf.gas_temperate === 'gas_giant' && presetOf.gas_cold === 'gas_cold', `archetyp gazu → preset (${JSON.stringify(presetOf)})`);
  // Drivery z encji: strumień (planeta / księżyc przez rodzica / jasność z klasy), strefy księżyców.
  if (fluxOf && archetypeContext && moonZoneOfRank && bodyParamsOf) {
    const par = { id: 'pp', type: 'planet', planetType: 'gas', orbital: { a: 2 } };
    const moons = [0.003, 0.001, 0.002, 0.004].map((a, i) => ({ id: 'mm' + i, type: 'moon', parentPlanetId: 'pp', orbital: { a } }));
    const ctx = archetypeContext({ spectralType: 'K', luminosity: 0.5 }, [par], moons);
    const fOk = Math.abs(fluxOf(par, ctx) - 0.125) < 1e-12 && Math.abs(fluxOf(moons[0], ctx) - 0.125) < 1e-12
      && Math.abs(fluxOf({ type: 'planet', orbital: { a: 2 } }, { spectralType: 'M' }) - 0.01) < 1e-12
      && fluxOf({ type: 'moon', parentPlanetId: 'zz' }, ctx) === null && fluxOf({ type: 'planet', orbital: { a: 0 } }, ctx) === null;
    assert(fOk, 'fluxOf: L/a² (księżyc: a rodzica; brak jasności → klasa; brak rodzica / orbity → null)');
    const z = moons.map(m => ctx.moonZoneById.get(m.id)).join();
    assert(z === 'mid,inner,inner,outer' && moonZoneOfRank(0, 1) === 'inner' && moonZoneOfRank(2, 3) === 'outer' && moonZoneOfRank(1, 3) === 'mid',
      `strefy księżyców z rangi półosi u rodzica (n=4: ${z}; n=1 → inner; n=3 → inner/mid/outer)`);
    const bp = bodyParamsOf(moons[1], ctx);
    assert(bp.parentType === 'gas' && bp.moonZone === 'inner' && Math.abs(bp.flux - 0.125) < 1e-12, `bodyParamsOf księżyca: rodzic + strefa + strumień (${JSON.stringify({ parentType: bp.parentType, moonZone: bp.moonZone })})`);
  } else assert(false, 'fluxOf / archetypeContext / moonZoneOfRank dostępne');
} else assert(false, 'select / familyOf / candidatesFor dostępne (inaczej blok A2 się nie wykona)');

// ── A3 ───────────────────────────────────────────────────────────────────────
header('A3: tidallyLocked — orbita + klasa gwiazdy, bez RNG');
if (deriveTidallyLocked) {
  const lim = (c) => (DA.TIDAL_LOCK_BASE_AU ?? NaN) * Math.cbrt(DA.STAR_CLASS_MASS?.[c] ?? NaN);
  assert(DA.TIDAL_LOCK_BASE_AU === 0.85, `TIDAL_LOCK_BASE_AU = 0.85 AU (${DA.TIDAL_LOCK_BASE_AU})`);
  const table = [
    ['planet', 0.55, 'M', true], ['planet', 0.58, 'M', false], ['planet', 0.74, 'K', true], ['planet', 0.76, 'K', false],
    ['planet', 0.84, 'G', true], ['planet', 0.86, 'G', false], ['planet', 0.94, 'F', true], ['planet', 0.96, 'F', false],
    ['planet', 0.84, 'X', true], ['planet', 0.86, null, false], ['moon', 0.01, 'M', false], ['planetoid', 0.3, 'M', false],
    ['planet', NaN, 'M', false], ['planet', -1, 'M', false],
  ];
  const bad = table.filter(([k, a, c, w]) => deriveTidallyLocked(k, a, c) !== w);
  assert(bad.length === 0, `reguła a < 0.85·∛M_klasy (M ${lim('M').toFixed(3)}, K ${lim('K').toFixed(3)}, G ${lim('G').toFixed(3)}, F ${lim('F').toFixed(3)} AU), księżyc/planetoida false ${bad.length ? JSON.stringify(bad) : ''}`);
  const d = countDraws(() => { for (let i = 0; i < 500; i++) deriveTidallyLocked('planet', i / 100, 'MKGF'[i % 4]); });
  assert(d.n === 0, `derywacja nie losuje (${d.n} rzutów Math.random)`);
} else assert(false, 'deriveTidallyLocked dostępne');

// ── A4 ───────────────────────────────────────────────────────────────────────
header('A4: zamrożenie (D-CS-2)');
if (assignBodyArchetype && select && bodyParamsOf) {
  const { Planet } = await import('../../entities/Planet.js');
  const b = new Planet({ id: 'cs3b_frz', name: 'F', a: 1.4, planetType: 'rocky', mass: 1.1, atmosphere: 'breathable', temperatureC: 12, temperatureK: 285.15, composition: { H2O: 2.4 } });
  b.type = 'planet'; b.surfaceSeed = 12345;
  const ok = assignBodyArchetype(b, { spectralType: 'G' });
  assert(ok === true && b.bodyArchetype === 'terran' && b.tidallyLocked === false, `nadanie: ${b.bodyArchetype}, tidallyLocked ${b.tidallyLocked}`);
  const wb0 = b.waterBand, wc0 = b.waterCoverage;
  const wExp = waterBandOf ? waterBandOf(12345, 2.4) : null;
  assert(typeof wb0 === 'string' && typeof wc0 === 'number' && wExp && wb0 === wExp.waterBand && wc0 === wExp.waterCoverage,
    `terran dostaje waterBand + waterCoverage = waterBandOf(ziarno, H2O) (${wb0} ${wc0})`);
  b.temperatureC = 350; b.temperatureK = 623.15; b.atmosphere = 'none'; b.lifeScore = 0; b.composition.H2O = 0; b.orbital.a = 0.1;
  assert(select(bodyParamsOf(b), null, b.surfaceSeed) !== 'terran', `świadek: dzisiejsze parametry wybrałyby ${select(bodyParamsOf(b), null, b.surfaceSeed)}`);
  const again = assignBodyArchetype(b, { spectralType: 'M' });
  assert(again === false && b.bodyArchetype === 'terran' && b.tidallyLocked === false, 'po dryfie temperatury/atmosfery/orbity archetyp i tidallyLocked zostają (??=)');
  assert(b.waterBand === wb0 && b.waterCoverage === wc0 && waterBandOf && waterBandOf(12345, 0).waterCoverage !== wc0,
    `po dryfie H2O (2.4 → 0) waterBand / waterCoverage zostają (świadek: dziś wyszłoby ${waterBandOf?.(12345, 0)?.waterCoverage})`);
  // Id spoza tabeli (CS-3b v1: toxic / rocky_moon / icy_moon) nie jest archetypem → wybór od nowa; ważny id zostaje.
  const legacy = [['toxic', { type: 'planet', planetType: 'rocky', atmosphere: 'dense', temperatureC: 20, orbital: { a: 1 }, composition: { H2O: 1 }, physics: { mass: 1 } }],
    ['rocky_moon', { type: 'moon', moonType: 'rocky', atmosphere: 'none', temperatureC: -150 }], ['icy_moon', { type: 'moon', moonType: 'icy', atmosphere: 'none', temperatureC: -200 }]];
  const legOk = legacy.every(([old, body]) => { const x = { ...body, bodyArchetype: old, surfaceSeed: 5 }; assignBodyArchetype(x, { spectralType: 'G' }); return !!BY_ID[x.bodyArchetype]; });
  const keep = { type: 'planet', planetType: 'rocky', atmosphere: 'none', temperatureC: -50, orbital: { a: 1 }, bodyArchetype: 'ocean', surfaceSeed: 5 };
  assignBodyArchetype(keep, { spectralType: 'G' });
  assert(legOk && keep.bodyArchetype === 'ocean', `id spoza tabeli → wybór od nowa (toxic → hothouse itd.); ważny id zostaje (ocean → ${keep.bodyArchetype})`);
  // Dom imperium: zawsze terran, także gdy reguły dałyby co innego (pkt 5).
  const hw = { type: 'planet', planetType: 'rocky', atmosphere: 'breathable', temperatureC: 20, orbital: { a: 1 }, composition: { H2O: 25 }, surfaceSeed: 77, lifeScore: 0 };
  const hwRule = select(bodyParamsOf({ ...hw }, { spectralType: 'G' }), null, 77);
  assignBodyArchetype(hw, { spectralType: 'G' }, { homeworld: true });
  assert(hwRule === 'ocean' && hw.bodyArchetype === 'terran' && typeof hw.waterBand === 'string', `homeworld → terran (reguły dałyby ${hwRule}), z pasmem wody ${hw.waterBand}`);
  // Pasma wody: czysty hash, bez RNG; podział 60/25/15 na 20000 ziarnach przy H2O = WATER_H2O_REF; H2O przesuwa ku oceanowi.
  if (waterBandOf) {
    const cnt = { oceanic: 0, balanced: 0, continental: 0 };
    let covOk = true;
    const d = countDraws(() => {
      for (let s2 = 0; s2 < 20000; s2++) {
        const w = waterBandOf((s2 * 2654435761) >>> 0, 3);
        cnt[w.waterBand]++;
        const band = (DA.WATER_BANDS ?? []).find(x => x.id === w.waterBand);
        if (!band || !(w.waterCoverage >= band.lo && w.waterCoverage <= band.hi)) covOk = false;
      }
    });
    const pct = (k) => 100 * cnt[k] / 20000;
    assert(d.n === 0 && Math.abs(pct('oceanic') - 60) < 1.5 && Math.abs(pct('balanced') - 25) < 1.5 && Math.abs(pct('continental') - 15) < 1.5 && covOk,
      `waterBandOf: 20000 ziaren → oceanic ${pct('oceanic').toFixed(1)} / balanced ${pct('balanced').toFixed(1)} / continental ${pct('continental').toFixed(1)}%, pokrycie w paśmie, ${d.n} rzutów`);
    let wet = 0, dry = 0;
    for (let s2 = 0; s2 < 4000; s2++) { if (waterBandOf(s2, 9).waterBand === 'oceanic') wet++; if (waterBandOf(s2, 0).waterBand === 'oceanic') dry++; }
    assert(wet > dry, `więcej H2O → więcej oceanic (H2O 9: ${wet}, H2O 0: ${dry} na 4000)`);
  } else assert(false, 'waterBandOf dostępne');
  // Remis przez assignBodyArchetype (volcanic / scorched): rozstrzyga ZAPISANE surfaceSeed ciała (nie stała, nie id).
  const tieWins = new Map();
  let tieEq = 0;
  for (let s = 0; s < 64; s++) {
    const t = new Planet({ id: 'cs3b_tie', name: 'T', a: 1.4, planetType: 'rocky', mass: 1.2, atmosphere: 'none', temperatureC: 300, temperatureK: 573.15, composition: { H2O: 0 } });
    t.type = 'planet'; t.surfaceSeed = (s * 2246822519) >>> 0;
    assignBodyArchetype(t, { spectralType: 'G' });
    tieWins.set(t.bodyArchetype, (tieWins.get(t.bodyArchetype) ?? 0) + 1);
    if (t.bodyArchetype === select(bodyParamsOf(t, { spectralType: 'G' }), null, t.surfaceSeed)) tieEq++;
  }
  assert(tieWins.size === 2 && tieEq === 64, `assignBodyArchetype: remis rozstrzyga surfaceSeed ciała (${JSON.stringify([...tieWins])}, zgodnych z select ${tieEq}/64)`);
  const noSeed = new Planet({ id: 'cs3b_ns', name: 'N', a: 1, planetType: 'rocky', mass: 1, atmosphere: 'none', temperatureC: -50 });
  noSeed.type = 'planet';
  assert(assignBodyArchetype(noSeed, { spectralType: 'G' }) === false && noSeed.bodyArchetype == null && noSeed.tidallyLocked === false,
    'bez surfaceSeed archetyp czeka (null), tidallyLocked już nadane');
} else assert(false, 'assignBodyArchetype dostępne');

// ── A5 ───────────────────────────────────────────────────────────────────────
header('A5: ścieżka świata (StarSystemManager) + przed/po');
let baseline = null;
try { baseline = JSON.parse(readFileSync(BASELINE_URL, 'utf8')); } catch { baseline = null; }
assert(!!baseline && /^[0-9a-f]{7,40}$/.test(baseline.recordedFrom ?? ''), `ślad bazowy wczytany, recordedFrom=${baseline?.recordedFrom}`);
{
  const { ssm } = buildWorld(WORLD_SEEDS[0]);
  const bodies = KINDS.flatMap(k => EntityManager.getByType(k));
  const starOf = new Map(EntityManager.getByType('star').map(s => [s.systemId, s]));
  assert(bodies.length > 300 && starOf.size === WORLD_FOREIGN + 1, `świadek: ${bodies.length} ciał w ${starOf.size} układach`);
  assert(bodies.every(b => typeof b.bodyArchetype === 'string' && BY_ID[b.bodyArchetype] && typeof b.tidallyLocked === 'boolean'),
    `każde ciało ma archetyp + tidallyLocked (${bodies.filter(b => typeof b.bodyArchetype === 'string').length}/${bodies.length})`);
  const terr = bodies.filter(b => b.bodyArchetype === 'terran');
  const wOk = terr.filter(b => waterBandOf && b.waterBand === waterBandOf(b.surfaceSeed, b.composition?.H2O).waterBand && typeof b.waterCoverage === 'number').length;
  assert(terr.length >= 1 && wOk === terr.length && bodies.every(b => b.bodyArchetype === 'terran' || b.waterBand == null),
    `terran (${terr.length}) mają waterBand = waterBandOf(ziarno, H2O) (${wOk}); inne ciała bez pasma`);
  if (select && bodyParamsOf && deriveTidallyLocked) {
    const eq = bodies.filter(b => b.bodyArchetype === selectInWorld(b)
      && b.tidallyLocked === deriveTidallyLocked(b.type, b.orbital?.a, starOf.get(b.systemId)?.spectralType)).length;
    assert(eq === bodies.length, `archetyp = select(parametry, surfaceSeed), tidallyLocked = reguła z gwiazdy układu (${eq}/${bodies.length})`);
  }
  const homeP = EntityManager.getByType('planet').find(p => p.lifeScore === 100);
  assert(homeP?.bodyArchetype === 'terran', `dom (generateCivScenario, po makeHomeworldBreathable) → ${homeP?.bodyArchetype}`);
  const fams = new Set(bodies.map(b => BY_ID[b.bodyArchetype]?.family));
  assert(fams.size === 4, `świadek: wszystkie 4 rodziny w świecie (${[...fams]})`);
  const locked = EntityManager.getByType('planet').filter(p => p.tidallyLocked);
  assert(locked.length >= 1 && bodies.filter(b => b.type !== 'planet').every(b => b.tidallyLocked === false), `świadek: ${locked.length} planet w rotacji związanej; księżyce/planetoidy false`);
  // 0 rzutów w nadawaniu: pass na świecie bez archetypów + nowy układ przez generateAndRegister (generator ma własny strumień).
  for (const b of bodies) { b.bodyArchetype = null; b.tidallyLocked = null; b.waterBand = null; b.waterCoverage = null; }
  const d1 = countDraws(() => ssm.assignMissingArchetypes?.());
  assert(d1.r === bodies.length && d1.n === 0, `assignMissingArchetypes: nadał ${d1.r}/${bodies.length}, ${d1.n} rzutów Math.random`);
  if (select && bodyParamsOf && deriveTidallyLocked) {
    const eq2 = bodies.filter(b => b.bodyArchetype === selectInWorld(b)
      && b.tidallyLocked === deriveTidallyLocked(b.type, b.orbital?.a, starOf.get(b.systemId)?.spectralType)).length;
    const lk = bodies.filter(b => b.tidallyLocked === true).length;
    assert(eq2 === bodies.length && lk >= 1, `pass: tidallyLocked z gwiazdy WŁASNEGO układu, archetyp = select (${eq2}/${bodies.length}, związanych ${lk})`);
  }
  // Świadek dyskryminujący klasę gwiazdy w passie: M przy 0.80 AU → wolna (G byłaby związana), F przy 0.90 AU → związana.
  {
    const { Planet: PlanetC } = await import('../../entities/Planet.js');
    const { Star: StarC } = await import('../../entities/Star.js');
    const mk = (sys, cls, a) => {
      const st = new StarC({ id: 'st_' + sys, name: sys, spectralType: cls, mass: 1, luminosity: 1 }); st.systemId = sys; EntityManager.add(st);
      const p = new PlanetC({ id: 'pl_' + sys, name: sys + ' b', a, planetType: 'rocky', mass: 1, atmosphere: 'thin', temperatureC: -20, composition: { H2O: 1 } });
      p.systemId = sys; p.surfaceSeed = 99; EntityManager.add(p); return p;
    };
    const pm = mk('sys_cs3b_m', 'M', 0.80), pf = mk('sys_cs3b_f', 'F', 0.90);
    ssm.assignMissingArchetypes?.();
    assert(pm.tidallyLocked === false && pf.tidallyLocked === true && pf.bodyArchetype === 'tidally_locked' && pm.bodyArchetype === 'desert',
      `pass czyta klasę gwiazdy układu: M 0.80 AU → ${pm.tidallyLocked}/${pm.bodyArchetype}, F 0.90 AU → ${pf.tidallyLocked}/${pf.bodyArchetype}`);
  }
  const d2 = countDraws(() => ssm.generateAndRegister({ id: 'sys_cs3b_x', name: 'X', spectralType: 'K', mass: 0.7, luminosity: 0.4 }, { seed: 77, seededSystems: true }));
  const fresh = KINDS.flatMap(k => EntityManager.getByType(k)).filter(b => b.systemId === 'sys_cs3b_x');
  assert(fresh.length > 10 && fresh.every(b => typeof b.bodyArchetype === 'string') && d2.n === 0, `generateAndRegister: ${fresh.length} ciał z archetypem, ${d2.n} rzutów Math.random harnessu`);
  // Przed/po: ta sama ścieżka na bazie (bez archetypów) i teraz — identyczne poza polami CS-3b.
  if (baseline) {
    const schemaOk = JSON.stringify(baseline.schema?.worldSeeds) === JSON.stringify(WORLD_SEEDS) && baseline.schema?.worldForeign === WORLD_FOREIGN
      && baseline.schema?.smallBodies === GAME_CONFIG.FEATURES.smallBodies;
    assert(schemaOk, 'schemat śladu = bieżący zestaw ziaren / liczba układów / smallBodies');
    for (const s of WORLD_SEEDS) {
      const now = worldDigest(s);
      const base = baseline.world?.[s];
      assert(!!base && now.sha256 === base.sha256 && now.bodies === base.bodies, `świat seedowany ${s}: ${now.bodies} ciał identycznych z bazą poza polami CS-3b`);
      const added = now.keys.filter(k => !base?.keys?.includes(k));
      assert(JSON.stringify(added) === '["bodyArchetype","tidallyLocked","waterBand","waterCoverage"]', `nowe klucze ciał względem bazy: ${JSON.stringify(added)}`);
    }
  }
}

// ── A6 ───────────────────────────────────────────────────────────────────────
header('A6: GasGiantShader — uniformy bez zmian');
{
  const now = await gasNs.gasUniformsDigest(SRC_ROOT);
  assert(!now.err && /^[0-9a-f]{64}$/.test(now.sha256 ?? ''), `uniformy policzone dla ${Object.keys(now.perBody).length} ciał gazowych ${now.err ?? ''}`);
  assert(!!baseline?.gas?.sha256 && now.sha256 === baseline.gas.sha256, 'uniformy bake = ślad bazy (bit w bit)');
  const withFields = await gasNs.gasUniformsDigest(SRC_ROOT, gasNs.GAS_DIGEST_BODIES.map((b, i) => ({ ...b, surfaceSeed: 1000 + i, tidallyLocked: i % 2 === 0,
    bodyArchetype: ['gas_cold', 'gas_warm', 'gas_temperate'][i % 3] })));
  assert(withFields.sha256 === now.sha256, 'uniformy nie zależą od bodyArchetype / tidallyLocked / surfaceSeed');
  const gs = readSrc('../../renderer/GasGiantShader.js') + readSrc('../../renderer/ThreeRenderer.js') + readSrc('../../renderer/PlanetTextureUtils.js');
  assert(gs.length > 1000 && !/bodyArchetype|BodyArchetype/.test(gs), 'pin: renderer nie czyta archetypu w CS-3b (brak zmiany wyglądu)');
}

// ── A7 ───────────────────────────────────────────────────────────────────────
header('A7: kontrola — ślad OFF CS-3a nadal bit w bit');
{
  const digestNs = await import('../headless/SysGenDigest.mjs');
  let t = null;
  try { t = JSON.parse(readFileSync(new URL('../fixtures/traces/CS3a-sysgen-off-baseline.json', import.meta.url), 'utf8')); } catch { t = null; }
  const now = withFlag(false, () => digestNs.sysGenDigest({ SystemGenerator, EntityManager, reseed: envNs.reseed }));
  const ok = !!t && Object.keys(t.digest.foreign).every(id => now.foreign[id]?.sha256 === t.digest.foreign[id].sha256)
    && Object.keys(t.digest.home).every(s => now.home[s]?.sha256 === t.digest.home[s].sha256);
  assert(ok, 'generateForStar + układ domowy (OFF) == ślad CS-3a (generator nietknięty)');
}

// ── A8 ───────────────────────────────────────────────────────────────────────
header('A8: GameCore.boot — domy, zapis, odczyt');
const { GameCore, HEADLESS_GALAXY_SEED } = await import('../headless/GameCore.js');
const { Planet } = await import('../../entities/Planet.js');
const { Moon } = await import('../../entities/Moon.js');
const { Planetoid } = await import('../../entities/Planetoid.js');
const { Star } = await import('../../entities/Star.js');
// Replika _restoreSystem (GameScene nie importuje się pod node) — pola istotne dla CS-3a/3b; piny źródła niżej.
function restoreReplica(data) {
  EntityManager.clear();
  const addStar = (sd) => { const s = new Star({ id: sd.id, name: sd.name, spectralType: sd.spectralType, mass: sd.mass, luminosity: sd.luminosity }); s.systemId = sd.systemId ?? 'sys_home'; EntityManager.add(s); };
  addStar(data.star); for (const sd of data.stars ?? []) addStar(sd);
  for (const pd of data.planets) {
    const p = new Planet({ id: pd.id, name: pd.name, planetType: pd.planetType, a: pd.a, e: pd.e, T: pd.T, M: pd.M, mass: pd.mass, atmosphere: pd.atmosphere,
      temperatureK: pd.temperatureK, temperatureC: pd.temperatureC, surfaceRadius: pd.surfaceRadius, surfaceGravity: pd.surfaceGravity, composition: pd.composition });
    p.lifeScore = pd.lifeScore || 0; p.systemId = pd.systemId ?? 'sys_home';
    p.surfaceSeed = pd.surfaceSeed ?? null; p.tidallyLocked = pd.tidallyLocked ?? null; p.bodyArchetype = pd.bodyArchetype ?? null;
    p.waterBand = pd.waterBand ?? null; p.waterCoverage = pd.waterCoverage ?? null;
    EntityManager.add(p);
  }
  for (const md of data.moons ?? []) {
    const m = new Moon({ id: md.id, name: md.name, a: md.a, e: md.e, T: md.T, M: md.M, mass: md.mass, parentPlanetId: md.parentPlanetId, moonType: md.moonType || 'rocky',
      composition: md.composition || null, temperatureK: md.temperatureK || null, temperatureC: md.temperatureC ?? null, atmosphere: md.atmosphere || 'none' });
    m.systemId = md.systemId ?? 'sys_home'; m.surfaceSeed = md.surfaceSeed ?? null; m.tidallyLocked = md.tidallyLocked ?? null; m.bodyArchetype = md.bodyArchetype ?? null;
    EntityManager.add(m);
  }
  for (const pd of data.planetoids ?? []) {
    const p = new Planetoid({ id: pd.id, name: pd.name, planetoidType: pd.planetoidType || 'silicate', a: pd.a, e: pd.e, T: pd.T, M: pd.M, mass: pd.mass,
      temperatureK: pd.temperatureK, temperatureC: pd.temperatureC, composition: pd.composition });
    p.systemId = pd.systemId ?? 'sys_home'; p.surfaceSeed = pd.surfaceSeed ?? null; p.tidallyLocked = pd.tidallyLocked ?? null; p.bodyArchetype = pd.bodyArchetype ?? null;
    EntityManager.add(p);
  }
  const ssm = new StarSystemManager();
  const seeds = ssm.assignMissingSurfaceSeeds(data.civ4x?.galaxyData?.seed ?? data.__galaxySeed);
  const arch = ssm.assignMissingArchetypes?.() ?? -1;
  return { seeds, arch };
}
const snap = () => KINDS.flatMap(k => EntityManager.getByType(k)).map(b => `${b.id}:${b.bodyArchetype}:${b.tidallyLocked}:${b.surfaceSeed}:${b.waterBand ?? '-'}:${b.waterCoverage ?? '-'}`).join('|');
let coreForLater = null;
for (const flag of [false, true]) {
  withFlag(flag, () => {
    envNs.reseed('cs3b-boot-' + flag);
    const core = new GameCore();
    core.boot({ quiet: true, scenario: 'civilization' });
    coreForLater = core;
  });
  const K = window.KOSMOS;
  const bodies = KINDS.flatMap(k => EntityManager.getByType(k));
  assert(bodies.length > 30 && bodies.every(b => typeof b.bodyArchetype === 'string' && typeof b.tidallyLocked === 'boolean'),
    `boot ${flag ? 'ON' : 'OFF'}: każde ciało (${bodies.length}) ma archetyp + tidallyLocked`);
  assert(K.homePlanet?.bodyArchetype === 'terran', `boot ${flag ? 'ON' : 'OFF'}: dom gracza → ${K.homePlanet?.bodyArchetype}`);
  const aiHomes = (K.colonyManager?.getAllColonies?.() ?? []).filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player' && !c.isOutpost)
    .map(c => EntityManager.get(c.planetId)).filter(Boolean);
  assert(aiHomes.length >= 2, `świadek: ${aiHomes.length} domów AI`);
  const reOk = aiHomes.filter(b => b.bodyArchetype === 'terran' && b.atmosphere === 'breathable' && typeof b.waterBand === 'string'
    && waterBandOf && b.waterBand === waterBandOf(b.surfaceSeed, b.composition?.H2O).waterBand);
  assert(reOk.length === aiHomes.length, `domy AI: terran PO makeHomeworldBreathable, pasmo wody z H2O po mutacji (${aiHomes.map(b => b.bodyArchetype + '/' + b.waterBand).join(', ')})`);
  assert(typeof K.homePlanet?.waterBand === 'string' && typeof K.homePlanet?.waterCoverage === 'number', `dom gracza ma waterBand ${K.homePlanet?.waterBand} / ${K.homePlanet?.waterCoverage}`);
}
{
  const ss = coreForLater?.saveSystem;
  const p = EntityManager.getByType('planet')[0], m = EntityManager.getByType('moon')[0], pd = EntityManager.getByType('planetoid')[0];
  assert(!!ss && !!p && !!m && !!pd, 'świadek: SaveSystem + po jednym ciele każdego rodzaju');
  if (ss && p && m && pd) {
    const sp = ss._serializePlanet(p), sm = ss._serializeMoon(m), spd = ss._serializePlanetoid(pd);
    assert(sp.bodyArchetype === p.bodyArchetype && sp.tidallyLocked === p.tidallyLocked && typeof sp.bodyArchetype === 'string', '_serializePlanet niesie bodyArchetype + tidallyLocked');
    const hpS = ss._serializePlanet(window.KOSMOS.homePlanet);
    assert(hpS.waterBand === window.KOSMOS.homePlanet.waterBand && hpS.waterCoverage === window.KOSMOS.homePlanet.waterCoverage && typeof hpS.waterBand === 'string'
      && sp.waterBand === (p.waterBand ?? null), '_serializePlanet niesie waterBand + waterCoverage (dom gracza; nie-terran → null)');
    assert(sm.bodyArchetype === m.bodyArchetype && sm.tidallyLocked === m.tidallyLocked && typeof sm.bodyArchetype === 'string', '_serializeMoon niesie bodyArchetype + tidallyLocked');
    assert(spd.bodyArchetype === pd.bodyArchetype && spd.tidallyLocked === pd.tidallyLocked && typeof spd.bodyArchetype === 'string', '_serializePlanetoid niesie bodyArchetype + tidallyLocked');
    const bare = Object.assign(Object.create(Object.getPrototypeOf(m)), m, { bodyArchetype: undefined, tidallyLocked: undefined });
    const sb = ss._serializeMoon(bare);
    assert(sb.bodyArchetype === null && sb.tidallyLocked === null, 'brak pól → null w zapisie (nie undefined)');
    localStorage.removeItem('kosmos_save_v1');
    ss.save();
    let data = null; try { data = JSON.parse(localStorage.getItem('kosmos_save_v1')); } catch { data = null; }
    const recs = data ? [...data.planets, ...data.moons, ...data.planetoids] : [];
    assert(recs.length > 30 && recs.every(r => typeof r.bodyArchetype === 'string' && typeof r.tidallyLocked === 'boolean'),
      `pełny save() → każdy rekord ma bodyArchetype + tidallyLocked (${recs.filter(r => typeof r.bodyArchetype === 'string').length}/${recs.length})`);
    const { CURRENT_VERSION } = await import('../../systems/SaveMigration.js');
    assert(data?.version === CURRENT_VERSION && CURRENT_VERSION === 101, `bez bumpu wersji zapisu (version ${data?.version}, CURRENT_VERSION ${CURRENT_VERSION})`);
    if (data) {
      const before = snap();
      const r = restoreReplica(data);
      assert(r.seeds === 0 && r.arch === 0 && snap() === before, `odczyt (replika _restoreSystem) → te same archetypy, pass nadał ${r.arch}`);
    }
  }
  const gsrc = readSrc('../../scenes/GameScene.js');
  assert((gsrc.match(/p\.bodyArchetype\s*=\s*pd\.bodyArchetype\s*\?\?\s*null/g) || []).length === 2 && /m\.bodyArchetype\s*=\s*md\.bodyArchetype\s*\?\?\s*null/.test(gsrc)
      && (gsrc.match(/p\.tidallyLocked\s*=\s*pd\.tidallyLocked\s*\?\?\s*null/g) || []).length === 2 && /m\.tidallyLocked\s*=\s*md\.tidallyLocked\s*\?\?\s*null/.test(gsrc),
    'pin: _restoreSystem czyta bodyArchetype + tidallyLocked (planety, księżyce, planetoidy)');
  assert(/p\.waterBand\s*=\s*pd\.waterBand\s*\?\?\s*null/.test(gsrc) && /p\.waterCoverage\s*=\s*pd\.waterCoverage\s*\?\?\s*null/.test(gsrc),
    'pin: _restoreSystem czyta waterBand + waterCoverage (planety)');
  const iSeeds = gsrc.indexOf('assignMissingSurfaceSeeds(window.KOSMOS.galaxyData');
  const iArch = gsrc.indexOf('this.starSystemManager.assignMissingArchetypes()');
  const iEmp = gsrc.indexOf('EmpireGenerator.generate(window.KOSMOS.galaxyData');
  assert(iSeeds > 0 && iArch > iSeeds && iEmp > iArch, 'pin: start() nadaje archetypy PO ziarnach i PRZED spawnem imperiów');
  const csrc = readSrc('../../testing/headless/GameCore.js');
  const cSeeds = csrc.indexOf('assignMissingSurfaceSeeds(K.galaxyData.seed)'), cArch = csrc.indexOf('assignMissingArchetypes()');
  assert(cSeeds > 0 && cArch > cSeeds, 'pin: GameCore.boot — ten sam pass, po ziarnach');
  const ecb = readSrc('../../systems/EmpireColonyBootstrap.js');
  const iMut = ecb.indexOf('SystemGenerator.makeHomeworldBreathable(homePlanet)');
  const iRe = ecb.indexOf('homePlanet.bodyArchetype = null');
  const iAsg = ecb.indexOf('assignBodyArchetype(homePlanet');
  assert(iMut > 0 && iRe > iMut && iAsg > iRe, 'pin: bootstrap AI — ponowny wybór archetypu domu PO makeHomeworldBreathable');
  const asgCall = ecb.slice(iAsg, ecb.indexOf(');', iAsg) + 2);
  assert(/homeworld:\s*true/.test(asgCall) && /luminosity/.test(asgCall) && ecb.indexOf('homePlanet.waterBand = null') > iMut,
    'pin: bootstrap AI — dom jako homeworld (terran), kontekst z jasnością, pasmo wody od nowa');
  const ssmSrc = readSrc('../../systems/StarSystemManager.js');
  const gar = ssmSrc.slice(ssmSrc.indexOf('generateAndRegister(galaxyStar'), ssmSrc.indexOf('assignMissingSurfaceSeeds(galaxySeed)'));
  assert(gar.indexOf('assignSurfaceSeeds(') > 0 && gar.indexOf('assignBodyArchetype(') > gar.indexOf('assignSurfaceSeeds('), 'pin: generateAndRegister — archetyp PO ziarnach');
  const sgen = readSrc('../../generators/SystemGenerator.js');
  assert(!/bodyArchetype|tidallyLocked|waterBand|waterCoverage/.test(sgen), 'pin: generator NIE nadaje pól CS-3b / v2 (nadaje wołający; strumień RNG nietknięty)');
}

// ── A9 ───────────────────────────────────────────────────────────────────────
header('A9: kanoniczny fixture (v101) — ??= nadaje, zapis + odczyt stabilny');
{
  let data = null;
  try { data = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/GATE-S4-fresh-gy60.save.json.gz', import.meta.url))).toString('utf8')); } catch { data = null; }
  assert(!!data && data.version === 101, `fixture wczytany, version=${data?.version}`);
  if (data) {
    const recs = [...data.planets, ...data.moons, ...data.planetoids];
    assert(recs.length > 300 && recs.every(r => r.bodyArchetype === undefined && r.tidallyLocked === undefined && r.waterBand === undefined), `świadek: stary zapis bez pól CS-3b / v2 (${recs.length} ciał)`);
    const r1 = restoreReplica(data);
    const all = KINDS.flatMap(k => EntityManager.getByType(k));
    assert(r1.arch === recs.length && all.every(b => typeof b.bodyArchetype === 'string' && BY_ID[b.bodyArchetype] && typeof b.tidallyLocked === 'boolean'),
      `??= nadał archetyp KAŻDEMU ciału (${r1.arch}/${recs.length}), ziaren ${r1.seeds}`);
    const famOk = familyOf ? all.every(b => BY_ID[b.bodyArchetype]?.family === familyOf(b.type, b.planetType)) : false;
    const starOfF = new Map(EntityManager.getByType('star').map(st => [st.systemId, st]));
    const lockOk = deriveTidallyLocked ? all.filter(b => b.tidallyLocked === deriveTidallyLocked(b.type, b.orbital?.a, starOfF.get(b.systemId ?? 'sys_home')?.spectralType)).length : -1;
    const lockedF = EntityManager.getByType('planet').filter(b => b.tidallyLocked === true).length;
    assert(lockOk === all.length && lockedF >= 1, `tidallyLocked z zapisanej orbity + klasy gwiazdy układu (${lockOk}/${all.length}, związanych planet ${lockedF})`);
    assert(famOk, 'rodzina archetypu = typ ciała w całym fixture');
    const hp = EntityManager.getByType('planet').find(p => p.lifeScore >= 50 && p.atmosphere === 'breathable' && (p.systemId ?? 'sys_home') === 'sys_home');
    assert(!!hp && hp.bodyArchetype === 'terran', `dom gracza w fixture → ${hp?.bodyArchetype}`);
    const terrF = all.filter(b => b.bodyArchetype === 'terran');
    assert(terrF.length >= 1 && terrF.every(b => typeof b.waterBand === 'string' && typeof b.waterCoverage === 'number'), `fixture: każdy terran (${terrF.length}) dostał waterBand + waterCoverage przez ??=`);
    const s1 = snap();
    const ss = coreForLater?.saveSystem;
    if (ss) {
      const resaved = {
        ...data,
        planets: EntityManager.getByType('planet').map(b => ss._serializePlanet(b)),
        moons: EntityManager.getByType('moon').map(b => ss._serializeMoon(b)),
        planetoids: EntityManager.getByType('planetoid').map(b => ss._serializePlanetoid(b)),
      };
      const r2 = restoreReplica(JSON.parse(JSON.stringify(resaved)));
      assert(r2.arch === 0 && r2.seeds === 0 && snap() === s1, `zapis + odczyt → te same archetypy / tidallyLocked / ziarna, drugi pass nadał ${r2.arch}`);
    } else assert(false, 'SaveSystem z boot dostępny dla ponownego zapisu');
  }
}

// ── A10 ──────────────────────────────────────────────────────────────────────
header('A10: pomocniki konsoli csWorlds() / csArchetypes()');
{
  const dbg = await tryImport('../../debug/ColonySphereDebug.js');
  const h = typeof dbg.colonySphereDebugHelpers === 'function' ? dbg.colonySphereDebugHelpers() : {};
  assert(typeof h.csArchetypes === 'function', 'colonySphereDebugHelpers zwraca csArchetypes');
  if (typeof h.csArchetypes === 'function') {
    const origTable = console.table, origLog = console.log;
    let w = null, a = null, rowsW = null;
    console.table = (r) => { rowsW = rowsW ?? r; }; console.log = () => {};
    try {
      withFlag(true, () => { envNs.reseed('cs3b-dbg'); new GameCore().boot({ quiet: true, scenario: 'civilization' }); });
      window.KOSMOS.activeSystemId = 'sys_home';
      w = h.csWorlds(); a = h.csArchetypes();
    } finally { console.table = origTable; console.log = origLog; }
    assert(w && w.missingArchetypes === 0 && Array.isArray(rowsW) && rowsW.length === w.bodies
      && rowsW.every(r => 'archetype' in r && 'tidallyLocked' in r && typeof r.archetype === 'string'), `csWorlds(): kolumny archetype + tidallyLocked, missingArchetypes ${w?.missingArchetypes}`);
    assert(Array.isArray(rowsW) && rowsW.every(r => 'waterBand' in r && 'waterCoverage' in r && 'palette' in r)
      && rowsW.some(r => r.archetype === 'terran' && typeof r.waterBand === 'string') && w?.terranWithoutWaterBand === 0
      && rowsW.filter(r => r.kind === 'planetoid').every(r => typeof r.palette === 'string'),
      `csWorlds(): kolumny waterBand / waterCoverage / palette, terranWithoutWaterBand ${w?.terranWithoutWaterBand}`);
    const sum = (a?.rows ?? []).reduce((s, r) => s + r.count, 0);
    assert(a && a.missingArchetypes === 0 && a.bodies > 30 && sum === a.bodies && a.systems >= 3 && a.galaxySeed === HEADLESS_GALAXY_SEED && a.worldSeeded === true,
      `csArchetypes(): ${JSON.stringify({ ...a, rows: a?.rows?.length })}`);
    const fams = new Set((a?.rows ?? []).map(r => r.family));
    assert(fams.size === 4 && (a?.rows ?? []).length === 21, 'csArchetypes(): wiersz na każdy z 21 archetypów, 4 rodziny');
    const pal = a?.planetoidPalettes ?? {}, wbs = a?.terranWaterBands ?? {};
    const palSum = Object.values(pal).reduce((s2, n2) => s2 + n2, 0);
    const pRows = (a?.rows ?? []).filter(r => r.family === 'planetoid').reduce((s2, r) => s2 + r.count, 0);
    assert(['metallic', 'carbonaceous', 'silicate', 'icy'].every(k => k in pal) && palSum === pRows && pRows > 0 && wbs.missing === 0
      && (wbs.oceanic + wbs.balanced + wbs.continental) === ((a?.rows ?? []).find(r => r.archetype === 'terran')?.count ?? -1),
      `csArchetypes(): palety planetoid ${JSON.stringify(pal)}, pasma wody terran ${JSON.stringify(wbs)}`);
    const gsrc = readSrc('../../scenes/GameScene.js');
    assert(/window\.csArchetypes\s*=\s*window\.KOSMOS\.debug\?\.csArchetypes/.test(gsrc), 'pin: alias window.csArchetypes (bez argumentów, bez cudzysłowów)');
  }
}

// ── A11 ──────────────────────────────────────────────────────────────────────
header('A11: galaktyka headless — cele rozkładu CS-3b-v2 (5 seedów × 72 układy)');
{
  const probe = await tryImport('../headless/probe-cs3b-archetypes.mjs');
  if (typeof probe.galaxyCensus === 'function' && typeof probe.bootHomes === 'function') try {
    const SEEDS5 = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
    const agg = {}, presence = {}, water = { oceanic: 0, balanced: 0, continental: 0, missing: 0 };
    const homes = [];
    let missing = 0;
    for (const sd of SEEDS5) {
      const r = probe.galaxyCensus(sd);
      missing += r.census.missing;
      for (const [fam, f] of Object.entries(r.census.families)) {
        agg[fam] ??= { total: 0, counts: {} };
        agg[fam].total += f.total;
        for (const [id, n2] of Object.entries(f.counts)) { agg[fam].counts[id] = (agg[fam].counts[id] ?? 0) + n2; presence[id] = (presence[id] ?? 0) + (n2 > 0 ? 1 : 0); }
      }
      for (const [k, n2] of Object.entries(r.census.waterBands ?? {})) water[k] = (water[k] ?? 0) + n2;
      homes.push(...probe.bootHomes(sd));
    }
    const maxOf = (fam) => Math.max(...Object.values(agg[fam]?.counts ?? { x: 100 }).map(n2 => 100 * n2 / (agg[fam]?.total || 1)));
    assert(missing === 0 && agg.planet?.total > 1500 && agg.moon?.total > 4000, `świadek: ${agg.planet?.total} planet, ${agg.moon?.total} księżyców, bez archetypu ${missing}`);
    assert(maxOf('planet') <= 35, `żaden archetyp planety > 35% planet (max ${maxOf('planet').toFixed(1)}%)`);
    assert(maxOf('moon') <= 45, `żaden archetyp księżyca > 45% księżyców (max ${maxOf('moon').toFixed(1)}%)`);
    const rare = ROWS.map(r => r.id).filter(id => !['gas_warm', 'ocean'].includes(id) && !((presence[id] ?? 0) >= 3));
    assert(ROWS.length === 21 && rare.length === 0, `każdy archetyp (poza gas_warm, ocean) w ≥ 3 z 5 galaktyk${rare.length ? ' — brak: ' + rare.join(', ') : ''}`);
    const wN = water.oceanic + water.balanced + water.continental;
    const wp = (k) => 100 * water[k] / (wN || 1);
    assert(wN >= 40 && water.missing === 0 && Math.abs(wp('oceanic') - 60) <= 7 && Math.abs(wp('balanced') - 25) <= 7 && Math.abs(wp('continental') - 15) <= 7,
      `pasma wody terran (n=${wN}): oceanic ${wp('oceanic').toFixed(1)} / balanced ${wp('balanced').toFixed(1)} / continental ${wp('continental').toFixed(1)}% (cel 60/25/15 ± 7 pp)`);
    const bad = homes.filter(h => h.archetype !== 'terran');
    assert(homes.length === 15 && bad.length === 0, `domy imperiów terran: ${homes.length - bad.length}/${homes.length}${bad.length ? ' — ' + bad.map(h => h.owner + '=' + h.archetype).join(', ') : ''}`);
  } catch (e) { assert(false, `A11: spis galaktyki rzucił wyjątek (${e?.message ?? e})`); }
  else assert(false, `sonda probe-cs3b-archetypes eksportuje galaxyCensus + bootHomes (${probe.__err ?? ''})`);
}

console.log(`\n=== colony_sphere_archetypes_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
