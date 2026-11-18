// KOSMOS — sonda CS-3b / CS-3b-v2: rozkład archetypów ciał w CAŁEJ galaktyce seedowanego świata (COLONY_SPHERE_PLAN §3.3).
//
// Dla każdego galaxySeed z listy: układ domowy (generateCivScenario, świat seedowany) + WSZYSTKIE 71 obcych układów
// przez PRAWDZIWĄ ścieżkę gry (StarSystemManager.registerHomeSystem → assignMissingSurfaceSeeds →
// assignMissingArchetypes → generateAndRegister), potem spis colonySphereArchetypeCensus (ten sam co csArchetypes()).
// Raport: liczby i % per rodzina, archetypy, które nie wystąpiły, archetypy > 40% rodziny, udział tidallyLocked,
// archetyp planety domowej gracza oraz (GameCore.boot, pełny start z AI) archetypy domów imperiów AI.
//
// CS-3b-v2: cele właściciela — planeta ≤ 35% planet, księżyc ≤ 45% księżyców, każdy archetyp w ≥ 3 z 5 galaktyk
// (wyjątki gas_warm, ocean), pasma wody terran 60/25/15 ± 7 pp, wszystkie domy imperiów terran; plus licznik
// „wygląd vs zapisana temperatura” (wejście do D-CS-19).
// Uruchomienie: node src/testing/headless/probe-cs3b-archetypes.mjs [--json out.json] [--seeds a,b,c]
// Sonda NIE stroi niczego — wartości odstające tylko zgłasza (decyzja właściciela).

import './env.js';
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };

const { GAME_CONFIG }        = await import('../../config/GameConfig.js');
const { SystemGenerator }    = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }    = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager }  = await import('../../systems/StarSystemManager.js');
const EntityManager          = (await import('../../core/EntityManager.js')).default;
const { colonySphereArchetypeCensus } = await import('../../debug/ColonySphereDebug.js');
const { GameCore }           = await import('./GameCore.js');

// Ziarna: harness (HEADLESS_GALAXY_SEED) + ziarna z bramek właściciela CS-3a (§3.2).
const DEFAULT_SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const argSeeds = process.argv.indexOf('--seeds');
const SEEDS = argSeeds >= 0 ? process.argv[argSeeds + 1].split(',').map(Number) : DEFAULT_SEEDS;
const jsonIdx = process.argv.indexOf('--json');
const OUTLIER_PCT = { planet: 35, moon: 45, gas: 101, planetoid: 101 };   // cele CS-3b-v2 (gas/planetoid bez celu)
const PRESENCE_MIN = 3;                          // archetyp w ≥ 3 galaktykach
const PRESENCE_EXEMPT = new Set(['gas_warm', 'ocean']);
const WATER_TARGET = { oceanic: 60, balanced: 25, continental: 15 };
const WATER_TOL_PP = 7;

// Wygląd vs zapisana temperatura (°C): archetyp → predykat SPRZECZNOŚCI. Wygląd z driverów, temperatura z modelu
// dzisiejszego — sprzeczność = miejsce, gdzie D-CS-19 (realistyczny model temperatury) zmieniłby liczbę.
export const LOOK_TEMP_CONTRADICTION = {
  terran:       T => T <= -10 || T >= 60,    // ciekła woda na powierzchni
  ocean:        T => T <= -10 || T >= 60,
  jungle:       T => T <= 10 || T >= 80,     // ciepło i mokro
  ice:          T => T > 0,                  // zamarznięty
  cryo_haze:    T => T > 0,                  // zimna mgła
  hothouse:     T => T < 50,                 // cieplarnia
  scorched:     T => T < 50,                 // spieczony
  icy_cracked:  T => T > 0,
  icy_cratered: T => T > 0,
  hazy_moon:    T => T >= 0,
};
export function lookTempContradictions() {
  const out = {};
  for (const kind of ['planet', 'moon', 'planetoid']) {
    for (const b of EntityManager.getByType(kind)) {
      const pred = LOOK_TEMP_CONTRADICTION[b.bodyArchetype];
      const T = b.temperatureC ?? (b.temperatureK != null ? b.temperatureK - 273.15 : null);
      if (!pred || T == null) continue;
      out[b.bodyArchetype] ??= { n: 0, bad: 0 };
      out[b.bodyArchetype].n++;
      if (pred(T)) out[b.bodyArchetype].bad++;
    }
  }
  return out;
}

export function galaxyCensus(galaxySeed) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed, seeded: true });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(galaxySeed, home.star.name, home.star.spectralType, { seededSystems: true });
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  ssm.assignMissingArchetypes();
  for (const gs of galaxyData.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, galaxyData);
  const census = colonySphereArchetypeCensus();
  const contradictions = lookTempContradictions();
  const hp = EntityManager.get(home.civPlanetId);
  return {
    census, contradictions,
    home: { star: home.star.spectralType, archetype: hp?.bodyArchetype, tidallyLocked: hp?.tidallyLocked,
            a: +(hp?.orbital?.a ?? 0).toFixed(3), tempC: hp?.temperatureC, h2o: +(hp?.composition?.H2O ?? 0).toFixed(1),
            waterBand: hp?.waterBand ?? null, waterCoverage: hp?.waterCoverage ?? null },
  };
}

export function bootHomes(galaxySeed) {
  const prev = GAME_CONFIG.FEATURES.seededSystems;
  GAME_CONFIG.FEATURES.seededSystems = true;
  try {
    const core = new GameCore();
    core.boot({ quiet: true, scenario: 'civilization', galaxySeed });
    const K = window.KOSMOS;
    const out = [{ owner: 'player', archetype: K.homePlanet?.bodyArchetype ?? null, tidallyLocked: K.homePlanet?.tidallyLocked ?? null,
                   waterBand: K.homePlanet?.waterBand ?? null }];
    for (const c of K.colonyManager?.getAllColonies?.() ?? []) {
      if (!c.ownerEmpireId || c.ownerEmpireId === 'player') continue;
      const b = EntityManager.get(c.planetId);
      if (!b || c.isOutpost) continue;
      out.push({ owner: c.ownerEmpireId, archetype: b.bodyArchetype ?? null, tidallyLocked: b.tidallyLocked ?? null, waterBand: b.waterBand ?? null,
                 atmosphere: b.atmosphere, tempC: b.temperatureC });
    }
    return out;
  } finally {
    GAME_CONFIG.FEATURES.seededSystems = prev;
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('probe-cs3b-archetypes.mjs')) {
  const perSeed = [];
  const agg = {};
  const presence = {};
  const water = { oceanic: 0, balanced: 0, continental: 0, missing: 0 };
  const palettes = {};
  const contra = {};
  let lockedN = 0, planetsN = 0;
  for (const seed of SEEDS) {
    const r = galaxyCensus(seed);
    const homes = bootHomes(seed);
    perSeed.push({ seed, systems: r.census.systems, bodies: r.census.bodies, missing: r.census.missing,
                   tidallyLocked: r.census.tidallyLocked, home: r.home, homes, families: r.census.families,
                   waterBands: r.census.waterBands, palettes: r.census.palettes });
    const [l, p] = r.census.tidallyLocked.split('/').map(Number);
    lockedN += l; planetsN += p;
    for (const [fam, f] of Object.entries(r.census.families)) {
      agg[fam] ??= { total: 0, counts: {} };
      agg[fam].total += f.total;
      for (const [id, n] of Object.entries(f.counts)) {
        agg[fam].counts[id] = (agg[fam].counts[id] ?? 0) + n;
        presence[id] = (presence[id] ?? 0) + (n > 0 ? 1 : 0);
      }
    }
    for (const [k, n] of Object.entries(r.census.waterBands)) water[k] = (water[k] ?? 0) + n;
    for (const [k, n] of Object.entries(r.census.palettes)) palettes[k] = (palettes[k] ?? 0) + n;
    for (const [k, v] of Object.entries(r.contradictions)) { contra[k] ??= { n: 0, bad: 0 }; contra[k].n += v.n; contra[k].bad += v.bad; }
  }
  console.log('\n== CS-3b-v2 — rozkład archetypów (' + SEEDS.length + ' seedów × 72 układy) ==');
  for (const s of perSeed) {
    console.log(`seed ${s.seed}: systems ${s.systems}, bodies ${s.bodies}, missing ${s.missing}, tidallyLocked ${s.tidallyLocked}`
      + ` · dom gracza: ${s.home.archetype}/${s.home.waterBand} (gwiazda ${s.home.star}, a=${s.home.a} AU, ${s.home.tempC} °C, H2O ${s.home.h2o}%, locked ${s.home.tidallyLocked})`);
    console.log('   domy (boot): ' + s.homes.map(h => `${h.owner}=${h.archetype}${h.tidallyLocked ? '(locked)' : ''}/${h.waterBand}`).join(', '));
  }
  const fails = [];
  for (const [fam, f] of Object.entries(agg)) {
    console.log(`\n-- ${fam} (n=${f.total})`);
    for (const [id, n] of Object.entries(f.counts)) {
      const pct = f.total ? 100 * n / f.total : 0;
      const perGal = perSeed.map(s => s.families[fam].counts[id] ?? 0).join('/');
      console.log(`   ${id.padEnd(15)} ${String(n).padStart(6)}  ${pct.toFixed(1).padStart(5)}%   galaktyki ${presence[id]}/${SEEDS.length}  [${perGal}]`);
      if (pct > OUTLIER_PCT[fam]) fails.push(`${id} ${pct.toFixed(1)}% > ${OUTLIER_PCT[fam]}% (${fam})`);
      if (presence[id] < PRESENCE_MIN && !PRESENCE_EXEMPT.has(id)) fails.push(`${id} tylko w ${presence[id]}/${SEEDS.length} galaktykach`);
    }
  }
  const wN = water.oceanic + water.balanced + water.continental;
  const wPct = Object.fromEntries(Object.keys(WATER_TARGET).map(k => [k, wN ? 100 * water[k] / wN : 0]));
  console.log(`\npasma wody terran (n=${wN}, bez pasma ${water.missing}): ` + Object.entries(wPct).map(([k, v]) => `${k} ${v.toFixed(1)}% (cel ${WATER_TARGET[k]})`).join(' · '));
  for (const k of Object.keys(WATER_TARGET)) if (Math.abs(wPct[k] - WATER_TARGET[k]) > WATER_TOL_PP) fails.push(`waterBand ${k} ${wPct[k].toFixed(1)}% poza ${WATER_TARGET[k]}±${WATER_TOL_PP}`);
  if (water.missing) fails.push(`terran bez waterBand: ${water.missing}`);
  console.log('palety planetoid:', JSON.stringify(palettes));
  const homesAll = perSeed.flatMap(s => s.homes);
  const homesBad = homesAll.filter(h => h.archetype !== 'terran');
  console.log(`domy imperiów terran: ${homesAll.length - homesBad.length}/${homesAll.length}`);
  if (homesBad.length) fails.push(`domy nie-terran: ${homesBad.map(h => h.owner + '=' + h.archetype).join(', ')}`);
  console.log(`tidallyLocked (planety): ${lockedN}/${planetsN} = ${(100 * lockedN / planetsN).toFixed(1)}%`);
  let cBad = 0, cN = 0;
  console.log('wygląd vs zapisana temperatura (sprzeczne / ciała):');
  for (const [k, v] of Object.entries(contra)) { cBad += v.bad; cN += v.n; console.log(`   ${k.padEnd(14)} ${v.bad}/${v.n}`); }
  console.log(`   RAZEM ${cBad}/${cN}`);
  console.log('\ncele CS-3b-v2:', fails.length ? 'NIESPEŁNIONE → ' + fails.join(' | ') : 'wszystkie spełnione');
  if (jsonIdx >= 0) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ seeds: SEEDS, perSeed, agg, presence, water, palettes, contra, lockedN, planetsN, fails }, null, 1));
  }
  const bad = perSeed.some(s => s.missing > 0);
  process.exit(bad ? 1 : 0);
}
