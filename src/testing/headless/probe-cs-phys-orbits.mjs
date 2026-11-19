// KOSMOS — CS-PHYS-b (plan COLONY_SPHERE §3.9): sonda rozkładów orbit dotychczasowe vs skalowane (klimat v2 w obu).
//
// Świat seedowany (galaxySeed) z climateModel 2 i orbitModel 1|2, dom + wszystkie układy obce (72). Per klasa gwiazdy:
// planety w HZ (HZ gwiazdy danego modelu + pas strumienia 0.346–1.384 S⊕ dla porównania), układy z ≥1 planetą w HZ,
// archetypy planet, udział tidallyLocked, min. orbita, naruszenia separacji kolizyjnej, księżyce poza połową odstępu,
// peek == generacja, dom (reguła wyboru) w HZ. Osobno: domy wszystkich imperiów przez GameCore.boot (gracz + AI) i licznik
// aktywacji pasma 5–35 °C.
//
// Uruchomienie: node src/testing/headless/probe-cs-phys-orbits.mjs [--seeds a,b,c] [--json out.json] [--homes N]

import './env.js';
import { writeFileSync } from 'node:fs';

const { GAME_CONFIG }       = await import('../../config/GameConfig.js');
const { SystemGenerator, collisionClearanceAU } = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { GameCore }          = await import('./GameCore.js');
const OM                    = await import('../../utils/OrbitModel.js');
const { EmpireColonyBootstrap } = await import('../../systems/EmpireColonyBootstrap.js');

const DEFAULT_SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const argI = (k) => process.argv.indexOf(k);
const SEEDS = argI('--seeds') >= 0 ? process.argv[argI('--seeds') + 1].split(',').map(Number) : DEFAULT_SEEDS;
const HOMES = argI('--homes') >= 0 ? Number(process.argv[argI('--homes') + 1]) : 12;
const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = o; console.warn = w; } };

export function buildWorld(galaxySeed, orbitModel, climateModel = 2) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed, seeded: true, climateModel, orbitModel });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(galaxySeed, home.star.name, home.star.spectralType,
    { seededSystems: true, climateModel, orbitModel });
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  ssm.assignMissingArchetypes();
  for (const gs of galaxyData.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, galaxyData);
  return { home, galaxyData, ssm };
}

const FLUX_IN = 1 / (0.85 * 0.85), FLUX_OUT = 1 / (1.7 * 1.7);
function measure(orbitModel) {
  const per = {};
  const cls = (c) => per[c] ??= { systems: 0, planets: 0, inHZ: 0, inFluxHZ: 0, sysWithHZ: 0, sysWithRockyHZ: 0,
    locked: 0, minOrbit: Infinity, maxOrbit: 0, sepViol: 0, moonsOutHalfGap: 0, moons: 0, planetoids: 0,
    planetoidMaxAU: 0, archetypes: {}, peekMismatch: 0, extentAU: [] };
  for (const seed of SEEDS) {
    const { galaxyData } = quietly(() => buildWorld(seed, orbitModel));
    for (const star of EntityManager.getByType('star')) {
      const sysId = star.systemId ?? 'sys_home';
      const c = cls(star.spectralType);
      c.systems++;
      const planets = EntityManager.getByTypeInSystem('planet', sysId).sort((a, b) => a.orbital.a - b.orbital.a);
      const hz = star.habitableZone;
      let hzN = 0, rockyHZ = 0;
      planets.forEach((p, i) => {
        const a = p.orbital.a, S = star.luminosity / (a * a);
        c.planets++;
        if (a >= hz.min && a <= hz.max) { c.inHZ++; hzN++; if (p.planetType === 'rocky') rockyHZ++; }
        if (S <= FLUX_IN && S >= FLUX_OUT) c.inFluxHZ++;
        if (p.tidallyLocked) c.locked++;
        c.minOrbit = Math.min(c.minOrbit, a); c.maxOrbit = Math.max(c.maxOrbit, a);
        if (i > 0 && a - planets[i - 1].orbital.a < collisionClearanceAU(planets[i - 1], p) - 1e-9) c.sepViol++;
        c.archetypes[p.bodyArchetype ?? 'none'] = (c.archetypes[p.bodyArchetype ?? 'none'] ?? 0) + 1;
        const gaps = [i > 0 ? a - planets[i - 1].orbital.a : a, i + 1 < planets.length ? planets[i + 1].orbital.a - a : Infinity];
        for (const m of EntityManager.getByType('moon').filter(m => m.parentPlanetId === p.id)) {
          c.moons++;
          if (m.orbital.a * (1 + (m.orbital.e ?? 0)) >= 0.5 * Math.min(...gaps)) c.moonsOutHalfGap++;
        }
      });
      if (hzN > 0) c.sysWithHZ++;
      if (rockyHZ > 0) c.sysWithRockyHZ++;
      const pls = EntityManager.getByTypeInSystem('planetoid', sysId);
      c.planetoids += pls.length;
      const ext = Math.max(planets.at(-1)?.orbital.a ?? 0, ...pls.map(x => x.orbital.a));
      c.planetoidMaxAU = Math.max(c.planetoidMaxAU, ...pls.map(x => x.orbital.a));
      c.extentAU.push(ext);
      if (sysId !== 'sys_home') {
        const gs = galaxyData.systems.find(s => s.id === sysId);
        const peek = new SystemGenerator().peekCountsForStar(gs, SystemGenerator.worldSeedContext(galaxyData), SystemGenerator.worldOrbitModel(galaxyData), SystemGenerator.worldClimateModel(galaxyData));
        if (peek.planets !== planets.length || peek.planetoids !== pls.length
            || peek.moons !== EntityManager.getByType('moon').filter(m => m.systemId === sysId).length) c.peekMismatch++;
      }
    }
  }
  for (const c of Object.values(per)) {
    const e = c.extentAU.sort((x, y) => x - y);
    c.extentMedianAU = Math.round(e[Math.floor(e.length / 2)] * 100) / 100;
    delete c.extentAU;
    c.lockedShare = Math.round(1000 * c.locked / Math.max(1, c.planets)) / 10;
    c.minOrbit = Math.round(c.minOrbit * 1000) / 1000; c.maxOrbit = Math.round(c.maxOrbit * 100) / 100;
    c.planetoidMaxAU = Math.round(c.planetoidMaxAU * 100) / 100;
  }
  return per;
}

// Domy wszystkich imperiów (gracz + AI) — prawdziwy bootstrap GameCore; flagi ustawione przed boot (decyzja świata).
function homes(orbitModel) {
  const out = { empires: 0, inHZ: 0, rockyHZAvailable: 0, byClass: {}, bandTotal: 0, bandCold: 0, bandHot: 0, flux: [] };
  GAME_CONFIG.FEATURES.scaledOrbits = orbitModel === 2;
  GAME_CONFIG.FEATURES.realisticClimate = true;
  GAME_CONFIG.FEATURES.seededSystems = true;
  for (let i = 0; i < HOMES; i++) {
    SystemGenerator.resetHomeworldBandStats();
    const core = quietly(() => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: 1000 + 7919 * i }); return c; });
    const K = globalThis.window.KOSMOS;
    const list = [{ body: K.homePlanet, sysId: 'sys_home' }];
    for (const emp of K.empireRegistry?.listAll?.() ?? []) {
      if (!emp.homeSystemId || emp.homeSystemId === 'sys_home') continue;
      const sys = K.starSystemManager.getSystem(emp.homeSystemId);
      // ciało domu AI = to, które wybrał bootstrap (ta sama czysta reguła, gwiazda układu decyduje o modelu)
      const body = EmpireColonyBootstrap._pickHomePlanet((sys?.planetIds ?? []).map(id => EntityManager.get(id)).filter(Boolean),
        EntityManager.getStarOfSystem(emp.homeSystemId));
      list.push({ body, sysId: emp.homeSystemId });
    }
    for (const { body, sysId } of list) {
      if (!body) continue;
      const star = EntityManager.getStarOfSystem(sysId);
      const hz = star.habitableZone;
      out.empires++;
      const ok = body.orbital.a >= hz.min && body.orbital.a <= hz.max;
      if (ok) out.inHZ++;
      const b = out.byClass[star.spectralType] ??= { n: 0, inHZ: 0 };
      b.n++; if (ok) b.inHZ++;
      out.flux.push(Math.round(1000 * star.luminosity / body.orbital.a ** 2) / 1000);
    }
    const st = SystemGenerator.homeworldBandStats();
    out.bandTotal += st.total; out.bandCold += st.cold; out.bandHot += st.hot;
    void core;
  }
  out.flux.sort((x, y) => x - y);
  out.fluxMin = out.flux[0]; out.fluxMedian = out.flux[Math.floor(out.flux.length / 2)]; out.fluxMax = out.flux.at(-1);
  delete out.flux;
  return out;
}

const result = { seeds: SEEDS, legacy: measure(1), scaled: measure(2), homesLegacy: homes(1), homesScaled: homes(2) };
const show = (title, per) => {
  console.log(`\n== ${title} ==`);
  for (const [k, c] of Object.entries(per).sort()) {
    const top = Object.entries(c.archetypes).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(', ');
    console.log(`${k}: sys ${c.systems} · planets ${c.planets} · inHZ ${c.inHZ} (flux-HZ ${c.inFluxHZ}) · sysWithHZ ${c.sysWithHZ}`
      + ` · sysRockyHZ ${c.sysWithRockyHZ} · locked ${c.lockedShare}% · orbit ${c.minOrbit}–${c.maxOrbit} AU`
      + ` · extent med ${c.extentMedianAU} AU · sepViol ${c.sepViol} · moonsOutHalfGap ${c.moonsOutHalfGap}/${c.moons}`
      + ` · peekMismatch ${c.peekMismatch}\n   archetypes: ${top}`);
  }
};
show('LEGACY orbits (climate v2)', result.legacy);
show('SCALED orbits (climate v2)', result.scaled);
console.log('\nhomes legacy:', JSON.stringify(result.homesLegacy));
console.log('homes scaled:', JSON.stringify(result.homesScaled));
if (argI('--json') >= 0) writeFileSync(process.argv[argI('--json') + 1], JSON.stringify(result, null, 1));
