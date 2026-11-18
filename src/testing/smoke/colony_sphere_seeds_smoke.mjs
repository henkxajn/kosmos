// KOSMOS — ARC COLONY SPHERE, krok CS-3a: ziarna powierzchni + układy z galaxySeed (D-CS-17).
// Plan: docs/design/COLONY_SPHERE_PLAN.md §0b, §2 (SurfaceSeed), §3 (CS-3a).
//
// S1  surfaceSeedFor — deterministyczne, zmienia się z każdym wejściem, uint32, zły argument → TypeError;
//     assignSurfaceSeeds — `??=` (istniejące ziarno zostaje), ordinal per (rodzaj, układ), brak seeda → 0;
//     pin źródła: SurfaceSeed.js / SeedMath.js bez Math.random, SurfaceSeed importuje tylko SeedMath.
// S2  Flaga seededSystems OFF (default) → generateForStar / peekCountsForStar / układ domowy BIT W BIT jak
//     na bazie (ślad traces/CS3a-sysgen-off-baseline.json, nagrany TYM plikiem z --record na worktree bazy);
//     OFF ignoruje podany galaxySeed.
// S3  Flaga ON → dwa różne galaxySeed = różne ciała tego samego starId; ten sam = identyczne; układ domowy
//     z galaxySeed niezależny od strumienia Math.random harnessu.
// S4  Flaga ON → peekCountsForStar == liczby generacji dla WSZYSTKICH 71 obcych gwiazd wygenerowanej galaktyki
//     (+ ścieżka gry: ObservatorySystem._countSystemBodies przed i po StarSystemManager.generateAndRegister).
// S5  generateAndRegister nadaje surfaceSeed każdemu ciału = surfaceSeedFor(galaxySeed, układ, rodzaj, indeks);
//     nadanie nie losuje (0 wywołań Math.random).
// S6  GameCore.boot (OFF i ON) — każde ciało w EntityManager ma surfaceSeed; dom: wzór z HEADLESS_GALAXY_SEED;
//     ON: dom niezależny od KOSMOS-owego reseed harnessu.
// S7  Zapis: SaveSystem serializuje surfaceSeed (3 rodzaje), pełny save() → localStorage niesie ziarna;
//     piny źródła ścieżki wczytania (GameScene._restoreSystem, start(), mint przed układem domowym).
// S8  Kanoniczny fixture (v101): brak ziaren (świadek), `??=` nadaje każdemu ciału, zapis + ponowny odczyt
//     → te same ziarna, drugi pass nadaje 0.
// S9  Pomocniki bramki csWorlds() / csPeek() wykonane na świecie GameCore.
// S10 CS-3a-fix (bramka krok 5): tryb układów = cecha świata (stempel galaxyData.seededSystems) — flaga przełączona po
//     starcie nie rozjeżdża skanu z generacją (OFF→ON i ON→OFF), nowe układy w trybie świata; kontrola rozjazdu.
// S11 CS-3a-fix fail-closed: worldSeedContext; świat seedowany bez galaxySeed → console.error [CS-3a] + licznik +
//     EMERGENCY_GALAXY_SEED (nie ziarno dotychczasowe); generacja przed rekordem świata przy fladze ON → głośno.
//
// Tryb nagrania (tylko na worktree bazy): node colony_sphere_seeds_smoke.mjs --record <plik.json>

import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as envNs from '../headless/env.js';

globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };

const { GAME_CONFIG }     = await import('../../config/GameConfig.js');
const { SystemGenerator } = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator } = await import('../../generators/GalaxyGenerator.js');
const EntityManager       = (await import('../../core/EntityManager.js')).default;
const digestNs            = await import('../headless/SysGenDigest.mjs');
const BASELINE_URL = new URL('../fixtures/traces/CS3a-sysgen-off-baseline.json', import.meta.url);

// ── Tryb nagrania ────────────────────────────────────────────────────────────
const recIdx = process.argv.indexOf('--record');
if (recIdx >= 0) {
  const out = process.argv[recIdx + 1];
  if (!out) { console.error('--record wymaga ścieżki'); process.exit(2); }
  const digest = digestNs.sysGenDigest({ SystemGenerator, EntityManager, reseed: envNs.reseed });
  const doc = {
    recordedFrom: process.env.CS3A_BASELINE_COMMIT ?? '(unset)',
    schema: { stars: digestNs.DIGEST_STARS.map(s => s.id), homeSeeds: digestNs.DIGEST_HOME_SEEDS, smallBodies: GAME_CONFIG.FEATURES.smallBodies },
    digest,
  };
  writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log('recorded →', out);
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

const SS  = await tryImport('../../utils/SurfaceSeed.js');
const SM  = await tryImport('../../utils/SeedMath.js');
const surfaceSeedFor     = typeof SS.surfaceSeedFor === 'function' ? SS.surfaceSeedFor : null;
const assignSurfaceSeeds = typeof SS.assignSurfaceSeeds === 'function' ? SS.assignSurfaceSeeds : null;
const KINDS = ['planet', 'moon', 'planetoid'];
const dig = (r) => digestNs.digestResult ? digestNs.digestResult(r).sha256 : null;
// CS-3a-fix — kontekst ziarna świata seedowanego (tryb świata jawnie, nie bieżąca flaga).
const ON = (galaxySeed) => ({ galaxySeed, seeded: true });

// ── S1 ───────────────────────────────────────────────────────────────────────
header('S1: surfaceSeedFor / assignSurfaceSeeds (czyste)');
assert(!!surfaceSeedFor && !!assignSurfaceSeeds, 'SurfaceSeed.js eksportuje surfaceSeedFor i assignSurfaceSeeds');
if (surfaceSeedFor) {
  const base = surfaceSeedFor(-2102099243, 'sys_017', 'moon', 3);
  assert(base === surfaceSeedFor(-2102099243, 'sys_017', 'moon', 3), 'deterministyczne (te same wejścia → to samo ziarno)');
  assert(Number.isInteger(base) && base >= 0 && base <= 0xFFFFFFFF, 'wynik uint32');
  assert(surfaceSeedFor(-2102099243 + 1, 'sys_017', 'moon', 3) !== base, 'zmienia się z galaxySeed');
  assert(surfaceSeedFor(-2102099243, 'sys_018', 'moon', 3) !== base, 'zmienia się z systemId');
  assert(surfaceSeedFor(-2102099243, 'sys_017', 'planetoid', 3) !== base, 'zmienia się z rodzajem');
  assert(surfaceSeedFor(-2102099243, 'sys_017', 'moon', 4) !== base, 'zmienia się z ordinal');
  // Rozrzut: pełna siatka 72 układy × 3 rodzaje × 60 ordinali = 12 960 ziaren — bez kolizji.
  const all = new Set();
  let n = 0;
  for (let s = 0; s < 72; s++) for (const k of KINDS) for (let o = 0; o < 60; o++) {
    all.add(surfaceSeedFor(12345, s === 0 ? 'sys_home' : `sys_${String(s).padStart(3, '0')}`, k, o)); n++;
  }
  assert(n === 12960 && all.size === n, `rozrzut: ${all.size}/${n} unikalnych`);
  const throws = (fn) => { try { fn(); return false; } catch (e) { return e instanceof TypeError; } };
  assert(throws(() => surfaceSeedFor(undefined, 'sys_home', 'planet', 0)), 'galaxySeed nie-liczba → TypeError');
  assert(throws(() => surfaceSeedFor(1, '', 'planet', 0)), 'pusty systemId → TypeError');
  assert(throws(() => surfaceSeedFor(1, 'sys_home', 'asteroid', 0)), 'rodzaj spoza listy → TypeError');
  assert(throws(() => surfaceSeedFor(1, 'sys_home', 'planet', -1)) && throws(() => surfaceSeedFor(1, 'sys_home', 'planet', 1.5)), 'ordinal ujemny / ułamkowy → TypeError');
}
if (assignSurfaceSeeds && surfaceSeedFor) {
  const bodies = {
    planet: [{ systemId: 'sys_home' }, { systemId: 'sys_001' }, { systemId: 'sys_home', surfaceSeed: 777 }, { systemId: 'sys_home' }],
    moon:   [{}, { systemId: 'sys_001' }],
  };
  const n = assignSurfaceSeeds(bodies, 99);
  assert(n === 5, `nadano 5 ziaren (jedno było już ustawione) — ${n}`);
  assert(bodies.planet[2].surfaceSeed === 777, '`??=`: istniejące ziarno zostaje');
  assert(bodies.planet[0].surfaceSeed === surfaceSeedFor(99, 'sys_home', 'planet', 0)
      && bodies.planet[3].surfaceSeed === surfaceSeedFor(99, 'sys_home', 'planet', 2)
      && bodies.planet[1].surfaceSeed === surfaceSeedFor(99, 'sys_001', 'planet', 0),
  'ordinal per (rodzaj, układ) w kolejności tablicy; ciało z ziarnem zajmuje swój indeks');
  assert(bodies.moon[0].surfaceSeed === surfaceSeedFor(99, 'sys_home', 'moon', 0), 'brak systemId → sys_home (fallback zapisu)');
  const empty = [{ systemId: 'sys_home' }];
  assert(assignSurfaceSeeds({ planet: empty }, undefined) === 0 && empty[0].surfaceSeed === undefined, 'brak galaxySeed → nic nie nadane');
}
{
  const ss = readSrc('../../utils/SurfaceSeed.js');
  const sm = readSrc('../../utils/SeedMath.js');
  assert(ss.length > 200 && !/Math\.random/.test(ss), 'pin: SurfaceSeed.js bez Math.random (świadek: plik niepusty)');
  assert(sm.length > 200 && !/Math\.random/.test(sm), 'pin: SeedMath.js bez Math.random');
  const imports = [...ss.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
  assert(imports.length === 1 && imports[0] === './SeedMath.js', `pin: SurfaceSeed.js importuje wyłącznie ./SeedMath.js (${imports.join(', ')})`);
  assert(!/\bwindow\b/.test(ss), 'pin: SurfaceSeed.js bez window');
}

// ── S2 ───────────────────────────────────────────────────────────────────────
header('S2: flaga OFF = bit w bit jak baza (ślad z worktree)');
assert(GAME_CONFIG.FEATURES.seededSystems === false, 'FEATURES.seededSystems istnieje i domyślnie false');
let baseline = null;
try { baseline = JSON.parse(readFileSync(BASELINE_URL, 'utf8')); } catch { baseline = null; }
assert(!!baseline && /^[0-9a-f]{7,40}$/.test(baseline.recordedFrom ?? ''), `ślad bazowy wczytany, recordedFrom=${baseline?.recordedFrom}`);
if (baseline) {
  const schemaOk = JSON.stringify(baseline.schema?.stars) === JSON.stringify(digestNs.DIGEST_STARS.map(s => s.id))
    && JSON.stringify(baseline.schema?.homeSeeds) === JSON.stringify(digestNs.DIGEST_HOME_SEEDS)
    && baseline.schema?.smallBodies === GAME_CONFIG.FEATURES.smallBodies;
  assert(schemaOk, 'schemat śladu = bieżący zestaw gwiazd / ziaren / smallBodies (zmiana konfiguracji ≠ regresja)');
  const now = withFlag(false, () => digestNs.sysGenDigest({ SystemGenerator, EntityManager, reseed: envNs.reseed }));
  for (const id of Object.keys(baseline.digest.foreign)) {
    assert(now.foreign[id]?.sha256 === baseline.digest.foreign[id].sha256, `OFF generateForStar(${id}) == baza (${baseline.digest.foreign[id].planets}p/${baseline.digest.foreign[id].moons}m/${baseline.digest.foreign[id].planetoids}pd)`);
    assert(JSON.stringify(now.peek[id]) === JSON.stringify(baseline.digest.peek[id]), `OFF peekCountsForStar(${id}) == baza`);
  }
  for (const s of Object.keys(baseline.digest.home)) {
    assert(now.home[s]?.sha256 === baseline.digest.home[s].sha256, `OFF układ domowy (reseed ${s}) == baza`);
  }
  // OFF ignoruje podany galaxySeed (wołający w grze ZAWSZE go podaje).
  if (digestNs.digestResult) {
    const gs = { ...digestNs.DIGEST_STARS[2] };
    const withSeed = withFlag(false, () => { EntityManager.clear(); return dig(new SystemGenerator().generateForStar(gs, 424242)); });
    assert(withSeed === baseline.digest.foreign[gs.id].sha256, `OFF + galaxySeed podany → nadal baza (${gs.id})`);
    const homeWithSeed = withFlag(false, () => { EntityManager.clear(); envNs.reseed(digestNs.DIGEST_HOME_SEEDS[0]); return dig(new SystemGenerator().generateCivScenario({ galaxySeed: 424242 })); });
    assert(homeWithSeed === baseline.digest.home[digestNs.DIGEST_HOME_SEEDS[0]].sha256, 'OFF + galaxySeed podany → układ domowy nadal baza');
  }
}

// ── S3 ───────────────────────────────────────────────────────────────────────
header('S3: flaga ON — ciała zależą od galaxySeed');
if (digestNs.digestResult && baseline) {
  let differ = 0, same = 0, differFromOff = 0;
  for (const gs of digestNs.DIGEST_STARS) {
    const run = (seed) => withFlag(false, () => { EntityManager.clear(); return dig(new SystemGenerator().generateForStar({ ...gs }, ON(seed))); });
    const a1 = run(111111), a2 = run(111111), b = run(-222222);
    if (a1 === a2) same++;
    if (a1 !== b) differ++;
    if (a1 !== baseline.digest.foreign[gs.id].sha256) differFromOff++;
  }
  const N = digestNs.DIGEST_STARS.length;
  assert(same === N, `ten sam galaxySeed → identyczne ciała (${same}/${N})`);
  assert(differ === N, `inny galaxySeed → inne ciała tego samego starId (${differ}/${N})`);
  assert(differFromOff === N, `ON ≠ OFF (${differFromOff}/${N})`);
  // CS-3a-fix: mutacje planety domowej PO generacji (makeHomeworldBreathable — temperatura, złoża Ti) biegną na
  // osobnym strumieniu z galaxySeed → ten sam galaxySeed daje identyczny dom BEZ maski, także temperaturę.
  const home = (seed, harness) => withFlag(false, () => {
    EntityManager.clear(); envNs.reseed(harness);
    const r = new SystemGenerator().generateCivScenario(ON(seed));
    const civ = r.planets.find(p => p.id === r.civPlanetId);
    return { d: dig(r), t: `${civ?.temperatureK}|${civ?.temperatureC}|${civ?.surface?.temperature}`, dep: JSON.stringify(civ?.deposits ?? null) };
  });
  const h1 = home(111111, 'harness-A'), h2 = home(111111, 'harness-B'), h3 = home(-222222, 'harness-A');
  assert(h1.d === h2.d, 'układ domowy (seeded): ten sam galaxySeed przy RÓŻNYCH strumieniach harnessu → identyczny, bez maski (temperatura planety domowej z galaxySeed)');
  assert(h1.t === h2.t && h1.dep === h2.dep, `planeta domowa: temperatura i złoża identyczne (${h1.t})`);
  assert(h1.d !== h3.d, 'układ domowy (seeded): inny galaxySeed → inny układ');
  const temps = new Set(['h-1', 'h-2', 'h-3', 'h-4', 'h-5', 'h-6'].map((h, i) => home(1000 + i * 7919, h).t));
  assert(temps.size >= 2, `kontrola: temperatura planety domowej zależy od galaxySeed (${temps.size} różnych na 6 seedów) — nie stała`);
  const hOffA = withFlag(false, () => { EntityManager.clear(); envNs.reseed('harness-A'); return dig(new SystemGenerator().generateCivScenario({ galaxySeed: 111111 })); });
  const hOffB = withFlag(false, () => { EntityManager.clear(); envNs.reseed('harness-B'); return dig(new SystemGenerator().generateCivScenario({ galaxySeed: 111111 })); });
  assert(hOffA !== hOffB, 'kontrola: OFF dom zależy od strumienia harnessu (nieseedowany Math.random)');
  // Strumień Math.random wołającego przywrócony po generacji (generate podmienia i oddaje).
  const before = Math.random;
  EntityManager.clear(); new SystemGenerator().generate(ON(5));
  assert(Math.random === before, 'generate (seeded) przywraca Math.random wołającego');
  EntityManager.clear(); new SystemGenerator().generateCivScenario(ON(5));
  assert(Math.random === before, 'generateCivScenario (seeded) przywraca Math.random wołającego po mutacjach planety domowej');
  const hBareA = withFlag(true, () => { EntityManager.clear(); envNs.reseed('harness-A'); return dig(new SystemGenerator().generateCivScenario({ galaxySeed: 111111 })); });
  const hBareB = withFlag(true, () => { EntityManager.clear(); envNs.reseed('harness-B'); return dig(new SystemGenerator().generateCivScenario({ galaxySeed: 111111 })); });
  assert(hBareA !== hBareB, 'tryb świata jawny: { galaxySeed } bez `seeded: true` przy fladze ON → dom nieseedowany (generator nie czyta flagi)');
}

// ── S4 ───────────────────────────────────────────────────────────────────────
header('S4: świat seedowany — peekCountsForStar == generacja dla całej galaktyki');
{
  const G_SEED = 1956783889;
  const galaxy = GalaxyGenerator.generate(G_SEED, 'Sol', 'G', { seededSystems: true });
  const foreign = galaxy.systems.filter(s => s.id !== 'sys_home');
  let match = 0, checked = 0;
  const bad = [];
  withFlag(true, () => {
    for (const gs of foreign) {
      EntityManager.clear();
      const peek = new SystemGenerator().peekCountsForStar(gs, ON(G_SEED));
      EntityManager.clear();
      const r = new SystemGenerator().generateForStar(gs, ON(G_SEED));
      checked++;
      if (peek.planets === r.planets.length && peek.moons === r.moons.length && peek.planetoids === r.planetoids.length) match++;
      else bad.push(gs.id);
    }
  });
  assert(checked === 71 && galaxy.systems.length === 72, `świadek: 72 gwiazdy, 71 obcych sprawdzonych (${checked})`);
  assert(match === checked, `peek == generacja dla ${match}/${checked}${bad.length ? ' — rozjazd: ' + bad.slice(0, 5).join(',') : ''}`);
  // Ścieżka gry: ObservatorySystem (peek przed generacją) vs encje po StarSystemManager.generateAndRegister.
  const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
  const { ObservatorySystem } = await import('../../systems/ObservatorySystem.js');
  let obs = null;
  try { obs = new ObservatorySystem(); } catch { obs = null; }
  if (obs && typeof obs._countSystemBodies === 'function') {
    let ok = 0, n = 0, differsFromLegacy = 0;
    withFlag(false, () => {   // CS-3a-fix: o trybie decyduje stempel świata — flaga OFF niczego tu nie zmienia
      EntityManager.clear();
      window.KOSMOS.galaxyData = galaxy;
      const ssm = new StarSystemManager();
      window.KOSMOS.starSystemManager = ssm;
      for (const gs of foreign.slice(0, 12)) {
        const before = obs._countSystemBodies(gs.id);
        ssm.generateAndRegister(gs);
        const after = obs._countSystemBodies(gs.id);
        const legacy = new SystemGenerator().peekCountsForStar(gs);
        n++;
        if (before && after && before.planets === after.planets && before.moons === after.moons && before.planetoids === after.planetoids) ok++;
        if (legacy.planets !== after.planets || legacy.moons !== after.moons || legacy.planetoids !== after.planetoids) differsFromLegacy++;
      }
    });
    assert(n === 12 && ok === n, `gra: skan obserwatorium przed == encje po generateAndRegister (${ok}/${n})`);
    assert(differsFromLegacy >= 1, `gra: generateAndRegister w świecie seedowanym naprawdę używa galaxySeed (${differsFromLegacy}/${n} różni się od ziarna dotychczasowego)`);
  } else {
    assert(false, 'ObservatorySystem._countSystemBodies dostępne');
  }
}

// ── S5 ───────────────────────────────────────────────────────────────────────
header('S5: generateAndRegister nadaje surfaceSeed (czysty hash, bez RNG)');
{
  const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
  const G_SEED = -77001;
  const galaxy = GalaxyGenerator.generate(G_SEED, 'Sol', 'G');
  for (const flag of [false, true]) {
    withFlag(flag, () => {
      EntityManager.clear();
      window.KOSMOS.galaxyData = galaxy;
      const ssm = new StarSystemManager();
      const gs = galaxy.systems.find(s => s.id === 'sys_009');
      const origRandom = Math.random;
      let draws = 0;
      // Liczymy rzuty WOŁAJĄCEGO strumienia: generateForStar podmienia Math.random na własny i oddaje,
      // więc po stronie wołającego każdy rzut to rzut poza generatorem (np. przy nadawaniu ziaren).
      Math.random = () => { draws++; return origRandom(); };
      try { ssm.generateAndRegister(gs); } finally { Math.random = origRandom; }
      let total = 0, ok = 0;
      const seeds = new Set();
      for (const kind of KINDS) {
        const list = EntityManager.getByType(kind).filter(b => b.systemId === 'sys_009');
        list.forEach((b, i) => {
          total++; seeds.add(b.surfaceSeed);
          if (surfaceSeedFor && b.surfaceSeed === surfaceSeedFor(G_SEED, 'sys_009', kind, i)) ok++;
        });
      }
      assert(total > 10 && ok === total, `flaga ${flag ? 'ON' : 'OFF'}: każde ciało sys_009 ma surfaceSeed = wzór (${ok}/${total})`);
      assert(seeds.size === total, `flaga ${flag ? 'ON' : 'OFF'}: ziarna unikalne w układzie (${seeds.size}/${total})`);
      assert(draws === 0, `flaga ${flag ? 'ON' : 'OFF'}: generateAndRegister + nadanie ziaren = 0 rzutów strumienia wołającego (${draws})`);
    });
  }
}

// ── S6 ───────────────────────────────────────────────────────────────────────
header('S6: GameCore.boot — ziarna w całym świecie, dom z galaxySeed przy ON');
const { GameCore, HEADLESS_GALAXY_SEED } = await import('../headless/GameCore.js');
function bootWorld(flag, harness) {
  return withFlag(flag, () => {
    envNs.reseed(harness);
    const core = new GameCore();
    core.boot({ quiet: true, scenario: 'civilization' });
    return core;
  });
}
function homeDigest() {
  const ps = EntityManager.getByType('planet').filter(p => p.systemId === 'sys_home');
  // CS-3a-fix: + temperatura i złoża (mutacja planety domowej po generacji też z galaxySeed)
  return ps.map(p => `${p.planetType}:${p.physics.mass.toFixed(6)}:${p.orbital.a.toFixed(6)}:${p.temperatureK}:${JSON.stringify(p.deposits ?? null)}`).join('|');
}
let coreForLater = null;
{
  const core = bootWorld(false, 'cs3a-boot-1');
  let total = 0, withSeed = 0, homeOk = 0, homeN = 0;
  for (const kind of KINDS) {
    const list = EntityManager.getByType(kind);
    const ord = new Map();
    for (const b of list) {
      total++;
      if (Number.isInteger(b.surfaceSeed)) withSeed++;
      const i = ord.get(b.systemId) ?? 0; ord.set(b.systemId, i + 1);
      if (b.systemId === 'sys_home') { homeN++; if (surfaceSeedFor && b.surfaceSeed === surfaceSeedFor(HEADLESS_GALAXY_SEED, 'sys_home', kind, i)) homeOk++; }
    }
  }
  const foreignSys = (window.KOSMOS.starSystemManager?.getAllSystems?.() ?? []).filter(s => s.systemId !== 'sys_home').length;
  assert(total > 50 && withSeed === total, `OFF: każde ciało w EntityManager ma surfaceSeed (${withSeed}/${total}; obce układy AI: ${foreignSys})`);
  assert(homeN > 10 && homeOk === homeN, `OFF: dom = surfaceSeedFor(HEADLESS_GALAXY_SEED, sys_home, rodzaj, indeks) (${homeOk}/${homeN})`);
  const offA = homeDigest();
  bootWorld(false, 'cs3a-boot-2');
  const offB = homeDigest();
  assert(offA !== offB, 'kontrola: OFF dom w harnessie zależy od KOSMOS reseed');
  bootWorld(true, 'cs3a-boot-1');
  const onA = homeDigest();
  const onTotal = KINDS.reduce((s, k) => s + EntityManager.getByType(k).length, 0);
  const onSeeded = KINDS.reduce((s, k) => s + EntityManager.getByType(k).filter(b => Number.isInteger(b.surfaceSeed)).length, 0);
  coreForLater = bootWorld(true, 'cs3a-boot-2');
  const onB = homeDigest();
  assert(onA === onB, 'ON: GameCore przekazuje galaxySeed → dom identyczny przy różnych reseed harnessu');
  assert(window.KOSMOS.galaxyData?.seededSystems === true, 'ON: GameCore stempluje świat (galaxyData.seededSystems === true)');
  bootWorld(false, 'cs3a-boot-3');
  assert(window.KOSMOS.galaxyData && !('seededSystems' in window.KOSMOS.galaxyData), 'OFF: galaxyData bez pola seededSystems (kształt jak na bazie)');
  coreForLater = bootWorld(true, 'cs3a-boot-2');
  assert(onTotal > 50 && onSeeded === onTotal, `ON: każde ciało ma surfaceSeed (${onSeeded}/${onTotal})`);
  void core;
}

// ── S7 ───────────────────────────────────────────────────────────────────────
header('S7: zapis i ścieżka wczytania');
{
  const ss = coreForLater?.saveSystem;
  const p = EntityManager.getByType('planet')[0], m = EntityManager.getByType('moon')[0], pd = EntityManager.getByType('planetoid')[0];
  assert(!!ss && !!p && !!m && !!pd, 'świadek: SaveSystem + po jednym ciele każdego rodzaju');
  if (ss && p && m && pd) {
    assert(ss._serializePlanet(p).surfaceSeed === p.surfaceSeed && Number.isInteger(p.surfaceSeed), '_serializePlanet niesie surfaceSeed');
    assert(ss._serializeMoon(m).surfaceSeed === m.surfaceSeed && Number.isInteger(m.surfaceSeed), '_serializeMoon niesie surfaceSeed');
    assert(ss._serializePlanetoid(pd).surfaceSeed === pd.surfaceSeed && Number.isInteger(pd.surfaceSeed), '_serializePlanetoid niesie surfaceSeed');
    const seedless = Object.assign(Object.create(Object.getPrototypeOf(m)), m, { surfaceSeed: undefined });
    assert(ss._serializeMoon(seedless).surfaceSeed === null, 'brak ziarna → null w zapisie (nie undefined)');
    localStorage.removeItem('kosmos_save_v1');
    ss.save();
    const raw = localStorage.getItem('kosmos_save_v1');
    let data = null; try { data = JSON.parse(raw); } catch { data = null; }
    const recs = data ? [...data.planets, ...data.moons, ...data.planetoids] : [];
    assert(recs.length > 50 && recs.every(r => Number.isInteger(r.surfaceSeed)), `pełny save() → każdy rekord ciała ma surfaceSeed (${recs.filter(r => Number.isInteger(r.surfaceSeed)).length}/${recs.length})`);
    const live = new Map(KINDS.flatMap(k => EntityManager.getByType(k)).map(b => [b.id, b.surfaceSeed]));
    assert(recs.length > 0 && recs.every(r => live.get(r.id) === r.surfaceSeed), 'rekordy zapisu == ziarna encji (po id)');
  }
  const gsrc = readSrc('../../scenes/GameScene.js');
  assert(/p\.surfaceSeed\s*=\s*pd\.surfaceSeed\s*\?\?\s*null/.test(gsrc) && /m\.surfaceSeed\s*=\s*md\.surfaceSeed\s*\?\?\s*null/.test(gsrc)
      && (gsrc.match(/p\.surfaceSeed\s*=\s*pd\.surfaceSeed\s*\?\?\s*null/g) || []).length === 2, 'pin: _restoreSystem czyta surfaceSeed dla planet, księżyców i planetoid');
  const iGal = gsrc.indexOf('window.KOSMOS.galaxyData = savedData.civ4x.galaxyData');
  const iAssign = gsrc.indexOf('assignMissingSurfaceSeeds(window.KOSMOS.galaxyData');
  assert(iGal > 0 && iAssign > iGal, 'pin: start() nadaje ziarna (??=) PO ustaleniu galaxyData (obie gałęzie)');
  assert(/preMintedGalaxySeed\s*=\s*\(\s*!savedData\s*&&\s*GAME_CONFIG\.FEATURES\.seededSystems\s*\)/.test(gsrc), 'pin: mint przed układem domowym tylko przy !savedData && seededSystems');
  assert(/_generateFreshSystem\(cx,\s*cy,\s*preMintedGalaxySeed\)/.test(gsrc) && /preMintedGalaxySeed\s*\?\?\s*GalaxyGenerator\.mintSeed\(\)/.test(gsrc), 'pin: ten sam seed trafia do układu domowego i do GalaxyGenerator.generate');
  assert(/generateCivScenario\(\{\s*galaxySeed:[^}]*seeded:\s*galaxySeed\s*!==\s*null\s*\}\)/.test(gsrc), 'pin: _generateFreshSystem podaje galaxySeed + seeded (= jest pre-mint) do generateCivScenario');
  assert(/preMintedGalaxySeed\s*\?\?\s*GalaxyGenerator\.mintSeed\(\),\s*star\.name,\s*star\.spectralType,\s*\{\s*seededSystems:\s*preMintedGalaxySeed\s*!==\s*null\s*\}/.test(gsrc),
    'pin: gałąź isNewGame stempluje świat tą samą decyzją co dom (seededSystems: preMintedGalaxySeed !== null)');
  const iNewGal = gsrc.indexOf('window.KOSMOS.galaxyData = GalaxyGenerator.generate(');
  const iEmp = gsrc.indexOf('EmpireGenerator.generate(window.KOSMOS.galaxyData');
  assert(iNewGal > 0 && iEmp > iNewGal, 'pin: rekord świata (seed + stempel) ustalony PRZED EmpireGenerator (pierwsza generacja układów obcych)');
  const csrc = readSrc('../../testing/headless/GameCore.js');
  assert(/generateCivScenario\(\{\s*galaxySeed,\s*seeded:\s*worldSeededSystems\s*\}\)/.test(csrc) && /GalaxyGenerator\.generate\(galaxySeed,[^)]*\{\s*seededSystems:\s*worldSeededSystems\s*\}\)/.test(csrc),
    'pin: GameCore — jedna decyzja świata (worldSeededSystems) dla domu i stempla galaktyki');
  const osrc = readSrc('../../systems/ObservatorySystem.js');
  assert(/peekCountsForStar\(gs,\s*SystemGenerator\.worldSeedContext\(window\.KOSMOS\?\.galaxyData\)\)/.test(osrc), 'pin: ObservatorySystem podaje kontekst świata (worldSeedContext(galaxyData)) do peekCountsForStar');
  const ecb = readSrc('../../systems/EmpireColonyBootstrap.js');
  const vm  = readSrc('../../systems/VesselManager.js');
  assert(/generateAndRegister\(galaxyStar,\s*galaxy\)/.test(ecb) && /generateAndRegister\(targetStar,\s*gd\)/.test(vm), 'pin: bootstrap AI i przylot statku podają rekord świata JAWNIE do generateAndRegister');
  const gen = readSrc('../../generators/SystemGenerator.js');
  const gfs = gen.slice(gen.indexOf('generateForStar(galaxyStar'), gen.indexOf('peekCountsForStar(galaxyStar'));
  const pk  = gen.slice(gen.indexOf('peekCountsForStar(galaxyStar'), gen.indexOf('peekCountsForStar(galaxyStar') + 400);
  assert(/this\._foreignRngSeed\(galaxyStar\.id,\s*seedCtx\)/.test(gfs) && /this\._foreignRngSeed\(galaxyStar\.id,\s*seedCtx\)/.test(pk), 'pin: generateForStar i peekCountsForStar biorą ziarno z jednego _foreignRngSeed (kontekst świata)');
  const flagReads = gen.match(/FEATURES\.seededSystems/g) ?? [];
  const wsc = gen.slice(gen.indexOf('static worldSeedContext('), gen.indexOf('static emergencySeedUses('));
  assert(flagReads.length === 1 && /FEATURES\.seededSystems/.test(wsc), `pin: SystemGenerator czyta flagę WYŁĄCZNIE w worldSeedContext (brak rekordu świata) — ${flagReads.length} odczyt(ów)`);
}

// ── S8 ───────────────────────────────────────────────────────────────────────
header('S8: kanoniczny fixture (v101) — ??= nadaje, zapis + odczyt stabilny');
{
  let data = null;
  try { data = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/GATE-S4-fresh-gy60.save.json.gz', import.meta.url))).toString('utf8')); } catch { data = null; }
  const { CURRENT_VERSION } = await import('../../systems/SaveMigration.js');
  assert(!!data && data.version === 101 && CURRENT_VERSION === 101, `fixture wczytany, version=${data?.version}, CURRENT_VERSION=${CURRENT_VERSION}`);
  assert(!!assignSurfaceSeeds && !!surfaceSeedFor, 'S8: assignSurfaceSeeds / surfaceSeedFor dostępne (inaczej blok poniżej się nie wykona)');
  if (data && assignSurfaceSeeds) {
    const gSeed = data.civ4x?.galaxyData?.seed;
    assert(Number.isFinite(gSeed), `fixture niesie galaxyData.seed (${gSeed})`);
    // Rekordy jak po _restoreSystem: surfaceSeed = rekord.surfaceSeed ?? null (pin S7), kolejność zapisu.
    const restore = (d) => ({
      planet:    d.planets.map(r => ({ ...r, surfaceSeed: r.surfaceSeed ?? null })),
      moon:      (d.moons || []).map(r => ({ ...r, surfaceSeed: r.surfaceSeed ?? null })),
      planetoid: (d.planetoids || []).map(r => ({ ...r, surfaceSeed: r.surfaceSeed ?? null })),
    });
    const before = [...data.planets, ...data.moons, ...data.planetoids];
    assert(before.length > 300 && before.every(r => r.surfaceSeed === undefined), `świadek: stary zapis bez ziaren (${before.length} ciał)`);
    const w1 = restore(data);
    const n1 = assignSurfaceSeeds(w1, gSeed);
    const all1 = KINDS.flatMap(k => w1[k]);
    assert(n1 === before.length && all1.every(b => Number.isInteger(b.surfaceSeed)), `??= nadał ziarno KAŻDEMU ciału (${n1}/${before.length})`);
    let ordOk = 0;
    for (const k of KINDS) { const ord = new Map(); for (const b of w1[k]) { const i = ord.get(b.systemId) ?? 0; ord.set(b.systemId, i + 1); if (b.surfaceSeed === surfaceSeedFor(gSeed, b.systemId ?? 'sys_home', k, i)) ordOk++; } }
    assert(ordOk === all1.length, `ordinal = indeks w zapisanej kolejności per (rodzaj, układ) (${ordOk}/${all1.length})`);
    const systems = new Set(all1.map(b => b.systemId));
    assert(systems.size >= 2, `świadek: fixture ma ciała w ${systems.size} układach`);
    assert(new Set(all1.map(b => b.surfaceSeed)).size === all1.length, 'ziarna unikalne w całym fixture');
    // Ponowny zapis (rekordy z ziarnem) + odczyt + drugi pass.
    const resaved = JSON.parse(JSON.stringify({ planets: w1.planet, moons: w1.moon, planetoids: w1.planetoid }));
    const w2 = restore(resaved);
    const n2 = assignSurfaceSeeds(w2, gSeed);
    const same = KINDS.every(k => w2[k].every((b, i) => b.surfaceSeed === w1[k][i].surfaceSeed));
    assert(n2 === 0 && same, `zapis + odczyt → te same ziarna, drugi pass nadał ${n2}`);
    // Inny galaxySeed nie przemaluje zapisanych światów (zapis jest prawdą).
    const w3 = restore(resaved);
    assert(assignSurfaceSeeds(w3, gSeed + 1) === 0 && KINDS.every(k => w3[k].every((b, i) => b.surfaceSeed === w1[k][i].surfaceSeed)), 'zapisane ziarno wygrywa z innym galaxySeed');
  }
}

// ── S9 ───────────────────────────────────────────────────────────────────────
header('S9: pomocniki bramki csWorlds() / csPeek()');
{
  const dbg = await tryImport('../../debug/ColonySphereDebug.js');
  assert(typeof dbg.colonySphereDebugHelpers === 'function', 'ColonySphereDebug.js eksportuje colonySphereDebugHelpers');
  if (typeof dbg.colonySphereDebugHelpers === 'function') {
    const { csWorlds, csPeek } = dbg.colonySphereDebugHelpers();
    const origTable = console.table, origLog = console.log;
    let w = null, pk = null, flagAfterPeek = null;
    console.table = () => {}; console.log = () => {};
    try {
      withFlag(true, () => { bootWorld(true, 'cs3a-dbg'); window.KOSMOS.activeSystemId = 'sys_home'; w = csWorlds(); pk = csPeek(); flagAfterPeek = GAME_CONFIG.FEATURES.seededSystems; });
    } finally { console.table = origTable; console.log = origLog; }
    assert(w && w.bodies > 10 && w.missingSeeds === 0 && w.uniqueSeeds === w.bodies && w.seededSystems === true && w.galaxySeed === HEADLESS_GALAXY_SEED,
      `csWorlds(): ${JSON.stringify(w)}`);
    assert(pk && pk.generatedForeign >= 1 && pk.mismatches === 0, `csPeek(): ${JSON.stringify(pk)}`);
    const [onDiff, onStars] = String(pk?.starsDifferFromLegacySeed ?? '0/0').split('/').map(Number);
    assert(onStars === 71 && onDiff >= 36, `csPeek() ON: większość gwiazd różni się od ziarna dotychczasowego (${pk?.starsDifferFromLegacySeed})`);
    assert(flagAfterPeek === true, 'csPeek() nie zmienia flagi (ON zostaje ON)');
    assert(pk?.worldSeeded === true && pk?.emergencySeedUses === 0 && w?.worldSeeded === true, `csPeek()/csWorlds(): worldSeeded + emergencySeedUses 0 (${pk?.worldSeeded}, ${pk?.emergencySeedUses})`);
    const dsrc = readSrc('../../debug/ColonySphereDebug.js');
    assert(!/FEATURES\.seededSystems\s*=[^=]/.test(dsrc), 'pin: pomocniki bramki nie piszą FEATURES.seededSystems (porównanie jawnych kontekstów)');
    let pkOff = null;
    console.table = () => {}; console.log = () => {};
    try { withFlag(false, () => { bootWorld(false, 'cs3a-dbg-off'); pkOff = csPeek(); }); }
    finally { console.table = origTable; console.log = origLog; }
    assert(pkOff && pkOff.starsDifferFromLegacySeed === '0/71' && pkOff.mismatches === 0, `csPeek() OFF: 0/71 różni się od ziarna dotychczasowego (${JSON.stringify(pkOff)})`);
  }
  const gsrc = readSrc('../../scenes/GameScene.js');
  const msrc = readSrc('../../main.js');
  assert(/window\.KOSMOS\.gameConfig\s*=\s*GAME_CONFIG/.test(msrc), 'pin: main.js wystawia KOSMOS.gameConfig już na ekranie tytułowym (flaga przed „Nowa gra”)');
  assert(/\.\.\.colonySphereDebugHelpers\(\)/.test(gsrc) && /window\.csWorlds\s*=/.test(gsrc) && /window\.csPeek\s*=/.test(gsrc), 'pin: GameScene wpina csWorlds / csPeek (KOSMOS.debug + window)');
}

// ── S10 ──────────────────────────────────────────────────────────────────────
// CS-3a-fix — bramka CS-3a krok 5 (FAIL właściciela, galaxySeed 813683454): świat utworzony przy fladze OFF,
// flaga ustawiona na ON PO starcie → csPeek 2/2 rozjazdów (odtworzone w CDP co do liczby). Tryb układów jest
// cechą świata (stempel w galaxyData), więc przełączenie flagi po starcie nie może rozjechać skanu z generacją.
header('S10: tryb układów = cecha świata — flaga przełączona po starcie nic nie zmienia');
{
  const dbg = await tryImport('../../debug/ColonySphereDebug.js');
  const { ObservatorySystem } = await import('../../systems/ObservatorySystem.js');
  const quiet = (fn) => { const t = console.table, l = console.log; console.table = () => {}; console.log = () => {}; try { return fn(); } finally { console.table = t; console.log = l; } };
  const e0 = typeof SystemGenerator.emergencySeedUses === 'function' ? SystemGenerator.emergencySeedUses() : -1;
  const countsOf = (sysId) => {
    const c = (k) => EntityManager.getByType(k).filter(b => b.systemId === sysId).length;
    return `${c('planet')}/${c('moon')}/${c('planetoid')}`;
  };
  const fmt = (c) => c ? `${c.planets}/${c.moons}/${c.planetoids}` : 'null';
  let obs = null; try { obs = new ObservatorySystem(); } catch { obs = null; }
  for (const [worldFlag, flipTo, tag] of [[false, true, 'OFF→ON'], [true, false, 'ON→OFF']]) {
    quiet(() => bootWorld(worldFlag, `cs3a-flip-${tag}`));
    const K = window.KOSMOS, ssm = K.starSystemManager, gd = K.galaxyData;
    const rows = typeof dbg.colonySphereGeneratedPeekRows === 'function' ? withFlag(flipTo, () => dbg.colonySphereGeneratedPeekRows()) : [];
    assert(rows.length >= 1 && rows.every(r => r.match), `świat ${worldFlag ? 'ON' : 'OFF'}, flaga ${tag} po starcie: csPeek peek == generacja (${rows.filter(r => r.match).length}/${rows.length})`);
    // Nowe układy po przełączeniu: tryb świata, zgodne ze skanem obserwatorium (przed) i encjami (po).
    const fresh = (gd?.systems ?? []).filter(s => s.id !== 'sys_home' && !ssm?.getSystem?.(s.id)).slice(0, 4);
    let ok = 0, worldMode = 0;
    withFlag(flipTo, () => {
      for (const gs of fresh) {
        const before = obs?._countSystemBodies?.(gs.id);
        ssm.generateAndRegister(gs);
        const after = countsOf(gs.id);
        const expect = fmt(new SystemGenerator().peekCountsForStar(gs, worldFlag ? ON(gd.seed) : undefined));
        if (fmt(before) === after) ok++;
        if (after === expect) worldMode++;
      }
    });
    assert(fresh.length === 4 && ok === 4, `${tag}: nowy układ po przełączeniu — skan przed == encje po (${ok}/${fresh.length})`);
    assert(worldMode === 4, `${tag}: nowy układ po przełączeniu losowany w trybie świata (${worldFlag ? 'seedowany' : 'dotychczasowy'}) (${worldMode}/4)`);
  }
  // Kontrola: ten sam świat OFF przeliczony w trybie seedowanym (dawne zachowanie: flaga czytana na żywo) rozjeżdża się.
  quiet(() => bootWorld(false, 'cs3a-flip-ctl'));
  const ctlRows = (window.KOSMOS.starSystemManager?.getAllSystems?.() ?? []).filter(s => s.systemId !== 'sys_home').map(sys => {
    const gs = window.KOSMOS.galaxyData.systems.find(x => x.id === sys.systemId);
    return fmt(new SystemGenerator().peekCountsForStar(gs, ON(window.KOSMOS.galaxyData.seed))) === countsOf(sys.systemId);
  });
  assert(ctlRows.length >= 1 && ctlRows.some(m => !m), `kontrola: świat OFF czytany jako seedowany daje rozjazd (${ctlRows.filter(m => !m).length}/${ctlRows.length}) — to był FAIL bramki`);
  assert(e0 >= 0 && SystemGenerator.emergencySeedUses() === e0, `ścieżka awaryjna nieużyta w S10 (${e0} → ${typeof SystemGenerator.emergencySeedUses === 'function' ? SystemGenerator.emergencySeedUses() : '?'})`);
}

// ── S11 ──────────────────────────────────────────────────────────────────────
header('S11: fail-closed — świat seedowany bez galaxySeed → console.error [CS-3a] + ścieżka awaryjna, nie ziarno dotychczasowe');
{
  const genNs = await import('../../generators/SystemGenerator.js');
  const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
  const EMERG = genNs.EMERGENCY_GALAXY_SEED;
  const wsc = typeof SystemGenerator.worldSeedContext === 'function' ? SystemGenerator.worldSeedContext : null;
  const J = (v) => JSON.stringify(v);
  assert(typeof EMERG === 'number' && Number.isFinite(EMERG), `EMERGENCY_GALAXY_SEED eksportowane (${EMERG})`);
  assert(!!wsc && J(wsc({ seed: 5, seededSystems: true })) === J({ galaxySeed: 5, seeded: true })
      && J(wsc({ seededSystems: true })) === J({ galaxySeed: null, seeded: true })
      && J(wsc({ seed: 5 })) === J({ galaxySeed: 5, seeded: false })
      && J(withFlag(true, () => wsc(undefined))) === J({ galaxySeed: null, seeded: true })
      && J(withFlag(false, () => wsc(undefined))) === J({ galaxySeed: null, seeded: false })
      && J(withFlag(true, () => wsc({ seed: 5 }))) === J({ galaxySeed: 5, seeded: false }),
    'worldSeedContext: stempel+seed / stempel bez seeda / rekord bez stempla (flaga bez wpływu) / brak rekordu → flaga');
  const capture = (fn) => {
    const errs = []; const orig = console.error;
    console.error = (...a) => errs.push(a.map(String).join(' '));
    try { return { v: fn(), errs }; } finally { console.error = orig; }
  };
  const uses = () => (typeof SystemGenerator.emergencySeedUses === 'function' ? SystemGenerator.emergencySeedUses() : -1);
  const base = digestNs.DIGEST_STARS[0];
  const BROKEN = { galaxySeed: null, seeded: true };
  const u0 = uses();
  const g = capture(() => { EntityManager.clear(); return dig(new SystemGenerator().generateForStar({ ...base, id: 'sys_cs3a_em1' }, BROKEN)); });
  assert(g.errs.some(t => t.includes('[CS-3a]')), `generateForStar: console.error z tagiem [CS-3a] (${g.errs.length} błędów)`);
  assert(u0 >= 0 && uses() === u0 + 1, `generateForStar: licznik ścieżki awaryjnej +1 (${u0} → ${uses()})`);
  EntityManager.clear(); const emergDig = dig(new SystemGenerator().generateForStar({ ...base, id: 'sys_cs3a_em1' }, ON(EMERG)));
  EntityManager.clear(); const legacyDig = dig(new SystemGenerator().generateForStar({ ...base, id: 'sys_cs3a_em1' }));
  assert(g.v === emergDig && g.v !== legacyDig, 'generateForStar: ścieżka awaryjna = ziarno EMERGENCY_GALAXY_SEED, NIE ziarno dotychczasowe');
  EntityManager.clear();
  const gCounts = new SystemGenerator().generateForStar({ ...base, id: 'sys_cs3a_em2' }, BROKEN);
  const pk = capture(() => new SystemGenerator().peekCountsForStar({ ...base, id: 'sys_cs3a_em2' }, BROKEN));
  assert(pk.v.planets === gCounts.planets.length && pk.v.moons === gCounts.moons.length && pk.v.planetoids === gCounts.planetoids.length,
    'peekCountsForStar na ścieżce awaryjnej == generacja (skan dalej spójny)');
  const hm = capture(() => { EntityManager.clear(); envNs.reseed('em-A'); return dig(new SystemGenerator().generateCivScenario(BROKEN)); });
  const hmB = capture(() => { EntityManager.clear(); envNs.reseed('em-B'); return dig(new SystemGenerator().generateCivScenario(BROKEN)); });
  assert(hm.errs.some(t => t.includes('[CS-3a]')) && hm.v === hmB.v, 'dom seedowany bez galaxySeed: błąd [CS-3a] + deterministyczny (ścieżka awaryjna), nie Math.random wołającego');
  // Późna dostępność seeda: generacja, zanim rekord świata istnieje (flaga ON) → głośno, nie po cichu.
  const savedGd = window.KOSMOS.galaxyData;
  try {
    window.KOSMOS.galaxyData = undefined;
    const u1 = uses();
    const late = capture(() => withFlag(true, () => { EntityManager.clear(); return new StarSystemManager().generateAndRegister({ ...base, id: 'sys_cs3a_late' }); }));
    assert(late.errs.some(t => t.includes('[CS-3a]')) && uses() === u1 + 1, `generateAndRegister bez rekordu świata przy fladze ON → [CS-3a] + ścieżka awaryjna (${late.errs.length} błędów, licznik ${u1} → ${uses()})`);
    const u2 = uses();
    const quietOff = capture(() => withFlag(false, () => { EntityManager.clear(); return new StarSystemManager().generateAndRegister({ ...base, id: 'sys_cs3a_off' }); }));
    assert(quietOff.errs.length === 0 && uses() === u2, 'kontrola: flaga OFF bez rekordu świata → ziarno dotychczasowe, bez błędu (zachowanie bazy)');
  } finally { window.KOSMOS.galaxyData = savedGd; }
}

console.log(`\n=== colony_sphere_seeds_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
