// KOSMOS — sonda CS-PHYS-a (D-CS-19, plan COLONY_SPHERE §3.8): klimat dotychczasowy (1) vs realistyczny (2).
//
// Dla każdego galaxySeed i każdego modelu: układ domowy (generateCivScenario, świat seedowany) + wszystkie obce układy
// przez prawdziwą ścieżkę gry (GalaxyGenerator ze stemplem climateModel → StarSystemManager.generateAndRegister),
// ziarna + archetypy jak w GameScene.start(). Te same ciała w obu modelach (klimat bez rzutów RNG) — sonda to sprawdza.
// Mierzy:
//   - reguły realizmu R1–R4 (definicje jak probe-cs3b-temperature: strefa wg HZ gwiazdy, księżyc — półoś rodzica),
//   - niespójności wygląd ↔ temperatura (LOOK_TEMP_CONTRADICTION; wariant: ciało bez atmosfery oceniane po dniu),
//   - rozkład temperatur rodzaj × atmosfera × strefa (min / mediana / max, n),
//   - konsumentów rozgrywki: pasmo temperatury (EnvironmentBands), bramka open-air (HexTile), okno życia LifeSystem,
//     zbiór terenów (BodyTerrainUtils), tekstura dotychczasowa (PlanetTextureUtils), archetypy, światy macierzyste.
//
// Uruchomienie: node src/testing/headless/probe-cs-phys-climate.mjs [--json out.json] [--seeds a,b,c]

import './env.js';

const { GAME_CONFIG }       = await import('../../config/GameConfig.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { temperatureBand }   = await import('../../data/EnvironmentBands.js');
const { getBodyTerrains }   = await import('../../utils/BodyTerrainUtils.js');
const { LOOK_TEMP_CONTRADICTION } = await import('../../utils/ClimateModel.js');
const { GameCore }          = await import('./GameCore.js');
// Lustro progów PlanetTextureUtils.resolveTextureType (renderer nie importuje się pod node — THREE.TextureLoader):
// tekstura dotychczasowa (sharedSurface OFF) zależna od temperatury — rocky planety i skaliste księżyce.
function legacyTextureMirror(b) {
  const T = tempOf(b);
  if (b.type === 'moon') return b.moonType === 'icy' ? 'ice' : T > 200 ? 'volcanic' : T > 60 ? 'rocky' : 'iron';
  if (b.planetType === 'gas') return T > -73 ? 'gas_warm' : T < -193 ? 'gas_cold' : 'gas_giant';
  if (b.planetType !== 'rocky') return b.planetType;
  return T > 200 ? 'lava-ocean' : T > 110 ? 'toxic' : T > 60 ? 'desert' : T > 10 ? 'ocean' : T > -20 ? 'rocky' : 'iron';
}

const DEFAULT_SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const argSeeds = process.argv.indexOf('--seeds');
const SEEDS = argSeeds >= 0 ? process.argv[argSeeds + 1].split(',').map(Number) : DEFAULT_SEEDS;
const jsonIdx = process.argv.indexOf('--json');

const tempOf = (b) => b.temperatureC ?? (b.temperatureK != null ? b.temperatureK - 273.15 : null);
const atmClass = (atm) => (atm === 'dense' || atm === 'thick') ? 'dense/thick' : (atm ?? 'none');
function zoneOf(a, hz) {
  if (a < hz.min) return 'inner';
  if (a <= hz.max) return 'hz';
  if (a <= hz.max * 2.2) return 'outer';
  return 'frost';
}

export function buildWorld(galaxySeed, climateModel) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed, seeded: true, climateModel });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(galaxySeed, home.star.name, home.star.spectralType,
    { seededSystems: true, climateModel });
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  ssm.assignMissingArchetypes();
  for (const gs of galaxyData.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, galaxyData);
  return { home, galaxyData };
}

/** Migawka ciał świata: klucz = systemId|rodzaj|nazwa (ten sam w obu modelach, bo ciała są te same). */
function snapshot() {
  const out = new Map();
  for (const kind of ['planet', 'moon', 'planetoid']) {
    for (const b of EntityManager.getByType(kind)) {
      const sysId = b.systemId ?? 'sys_home';
      const star = EntityManager.getStarOfSystem?.(sysId);
      const parent = kind === 'moon' ? EntityManager.get(b.parentPlanetId) : null;
      const a = kind === 'moon' ? parent?.orbital?.a : b.orbital?.a;
      out.set(`${sysId}|${kind}|${b.name}`, {
        kind, sysId, name: b.name, planetType: b.planetType ?? b.moonType ?? b.planetoidType, atmosphere: b.atmosphere ?? 'none',
        a, hz: star?.habitableZone, tempC: tempOf(b), archetype: b.bodyArchetype, climate: b.climate ?? null,
        parentType: parent?.planetType ?? null, lifeScore: b.lifeScore ?? 0,
        band: temperatureBand(tempOf(b)),
        terrains: kind === 'planetoid' ? null : [...getBodyTerrains(b)].sort().join(','),
        texture: kind !== 'planetoid' ? legacyTextureMirror(b) : null,
      });
    }
  }
  return out;
}

function rules(snap) {
  const v = { R1: [0, 0], R1b: [0, 0], R2: [0, 0], R2thin: [0, 0], R2breathable: [0, 0], R3: [0, 0], R4: [0, 0] };
  const hit = (k, bad) => { v[k][1]++; if (bad) v[k][0]++; };
  for (const b of snap.values()) {
    if (!b.hz || b.a == null || b.tempC == null || b.planetType === 'gas') continue;
    const T = b.tempC, atm = b.atmosphere, z = zoneOf(b.a, b.hz);
    if (atm === 'none' && b.a >= b.hz.min) hit('R1', T > 0);
    if (atm === 'none' && b.a < 0.5 * b.hz.min) hit('R1b', T < 100);
    if ((atm === 'thin' || atm === 'breathable') && z === 'hz' && b.kind !== 'planetoid') {
      hit('R2', !(T > -20 && T < 50));
      hit(atm === 'thin' ? 'R2thin' : 'R2breathable', !(T > -20 && T < 50));
    }
    if ((atm === 'dense' || atm === 'thick') && b.a <= b.hz.max) hit('R3', T < 100);
    if (b.kind === 'moon' && atm !== 'none' && b.a > b.hz.max) hit('R4', T >= 0);
  }
  return v;
}

function contradictions(snap) {
  const out = { total: 0, bad: 0, badDayJudged: 0, byArch: {} };
  for (const b of snap.values()) {
    const pred = LOOK_TEMP_CONTRADICTION[b.archetype];
    if (!pred || b.tempC == null) continue;
    out.total++;
    const r = out.byArch[b.archetype] ??= { n: 0, bad: 0 };
    r.n++;
    if (pred(b.tempC)) { r.bad++; out.bad++; }
    // wariant: wygląd ciała bez atmosfery (spieczony / lodowy) oceniany po stronie dziennej / nocnej
    const day = b.climate?.dayMaxC, night = b.climate?.nightMinC;
    const judged = (b.archetype === 'scorched' && day != null) ? day : b.tempC;
    if (pred(judged)) out.badDayJudged++;
  }
  return out;
}

function distribution(snap, cells) {
  for (const b of snap.values()) {
    if (!b.hz || b.a == null || b.tempC == null) continue;
    const kindLabel = b.kind === 'planet' ? b.planetType : `${b.kind} ${b.planetType}`;
    const key = `${kindLabel}|${atmClass(b.atmosphere)}|${zoneOf(b.a, b.hz)}`;
    (cells[key] ??= []).push(b.tempC);
  }
}

function stats(arr) {
  const s = [...arr].sort((x, y) => x - y);
  const r = (x) => Math.round(x);
  return `${r(s[0])} / ${r(s[Math.floor(s.length / 2)])} / ${r(s[s.length - 1])} (${s.length})`;
}

function bootHomes(galaxySeed, climateModel) {
  const prevS = GAME_CONFIG.FEATURES.seededSystems, prevC = GAME_CONFIG.FEATURES.realisticClimate;
  GAME_CONFIG.FEATURES.seededSystems = true;
  GAME_CONFIG.FEATURES.realisticClimate = climateModel === 2;
  try {
    const core = new GameCore();
    core.boot({ quiet: true, scenario: 'civilization', galaxySeed });
    const K = window.KOSMOS;
    const out = [{ owner: 'player', name: K.homePlanet?.name, tempC: K.homePlanet?.temperatureC, stamp: K.galaxyData?.climateModel ?? null }];
    for (const c of K.colonyManager?.getAllColonies?.() ?? []) {
      if (!c.ownerEmpireId || c.ownerEmpireId === 'player' || c.isOutpost) continue;
      const b = EntityManager.get(c.planetId);
      out.push({ owner: c.ownerEmpireId, name: b?.name, tempC: b?.temperatureC, atmosphere: b?.atmosphere });
    }
    return out;
  } finally {
    GAME_CONFIG.FEATURES.seededSystems = prevS;
    GAME_CONFIG.FEATURES.realisticClimate = prevC;
  }
}

const isMain = process.argv[1]?.endsWith('probe-cs-phys-climate.mjs');
if (isMain) {
  const res = { seeds: SEEDS, perModel: {}, sameBodies: true, consumers: {}, homes: [] };
  const cells = { 1: {}, 2: {} };
  const ruleAgg = { 1: null, 2: null }, contraAgg = { 1: null, 2: null }, archAgg = { 1: {}, 2: {} };
  const cons = { bodies: 0, bandChanged: {}, warmthGate: [0, 0], lifeWindow: [0, 0], terrainsChanged: 0, textureChanged: 0,
                 archetypeChanged: 0, homePickChanged: 0, textureMoves: {}, tidalMoons: 0, tidalMaxK: 0 };
  const addV = (agg, v) => { for (const [k, [b, n]] of Object.entries(v)) { agg[k] ??= [0, 0]; agg[k][0] += b; agg[k][1] += n; } };
  for (const seed of SEEDS) {
    const snaps = {};
    const homes = {};
    for (const model of [1, 2]) {
      const w = buildWorld(seed, model);
      homes[model] = EntityManager.get(w.home.civPlanetId)?.name;
      snaps[model] = snapshot();
      distribution(snaps[model], cells[model]);
      ruleAgg[model] ??= {}; addV(ruleAgg[model], rules(snaps[model]));
      const c = contradictions(snaps[model]);
      contraAgg[model] ??= { total: 0, bad: 0, badDayJudged: 0, byArch: {} };
      contraAgg[model].total += c.total; contraAgg[model].bad += c.bad; contraAgg[model].badDayJudged += c.badDayJudged;
      for (const [k, r] of Object.entries(c.byArch)) {
        const t = contraAgg[model].byArch[k] ??= { n: 0, bad: 0 }; t.n += r.n; t.bad += r.bad;
      }
      for (const b of snaps[model].values()) archAgg[model][`${b.kind}:${b.archetype}`] = (archAgg[model][`${b.kind}:${b.archetype}`] ?? 0) + 1;
    }
    if (homes[1] !== homes[2]) cons.homePickChanged++;
    // te same ciała?
    const k1 = [...snaps[1].keys()].sort().join('\n'), k2 = [...snaps[2].keys()].sort().join('\n');
    if (k1 !== k2) res.sameBodies = false;
    for (const [key, b1] of snaps[1]) {
      const b2 = snaps[2].get(key);
      if (!b2) continue;
      if (b1.atmosphere !== b2.atmosphere || b1.planetType !== b2.planetType || b1.a !== b2.a) res.sameBodies = false;
      if (b1.kind === 'planetoid' || b1.planetType === 'gas') continue;
      cons.bodies++;
      if (b1.band !== b2.band) { const t = `${b1.band}→${b2.band}`; cons.bandChanged[t] = (cons.bandChanged[t] ?? 0) + 1; }
      const warm = (b) => b.atmosphere !== 'none' && b.tempC >= 0;
      if (warm(b1)) cons.warmthGate[0]++;
      if (warm(b2)) cons.warmthGate[1]++;
      const life = (b) => b.tempC >= -35 && b.tempC <= 85;
      if (life(b1)) cons.lifeWindow[0]++;
      if (life(b2)) cons.lifeWindow[1]++;
      if (b1.terrains !== b2.terrains) cons.terrainsChanged++;
      if (b1.texture !== b2.texture) { cons.textureChanged++; const t = `${b1.texture}→${b2.texture}`; cons.textureMoves[t] = (cons.textureMoves[t] ?? 0) + 1; }
      if (b1.archetype !== b2.archetype) cons.archetypeChanged++;
      if ((b2.climate?.tidalC ?? 0) > 0) { cons.tidalMoons++; cons.tidalMaxK = Math.max(cons.tidalMaxK, b2.climate.tidalC); }
    }
    res.homes.push({ seed, legacy: bootHomes(seed, 1), v2: bootHomes(seed, 2) });
  }
  res.rules = ruleAgg;
  res.contradictions = contraAgg;
  res.consumers = cons;
  res.archetypes = archAgg;
  res.distribution = {};
  for (const key of new Set([...Object.keys(cells[1]), ...Object.keys(cells[2])])) {
    res.distribution[key] = { legacy: cells[1][key] ? stats(cells[1][key]) : '—', v2: cells[2][key] ? stats(cells[2][key]) : '—' };
  }
  console.log(JSON.stringify({ sameBodies: res.sameBodies, rules: res.rules, contradictions: { 1: { total: contraAgg[1].total, bad: contraAgg[1].bad, badDayJudged: contraAgg[1].badDayJudged }, 2: { total: contraAgg[2].total, bad: contraAgg[2].bad, badDayJudged: contraAgg[2].badDayJudged } } }, null, 1));
  console.log('contradictions by archetype legacy', JSON.stringify(contraAgg[1].byArch));
  console.log('contradictions by archetype v2    ', JSON.stringify(contraAgg[2].byArch));
  console.log('consumers', JSON.stringify(cons));
  console.log('homes', JSON.stringify(res.homes.map(h => ({ seed: h.seed, legacy: h.legacy.map(x => Math.round(x.tempC)), v2: h.v2.map(x => Math.round(x.tempC)), stamp: h.v2[0].stamp }))));
  if (jsonIdx >= 0) {
    const fs = await import('node:fs');
    fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(res, null, 1));
  }
}
