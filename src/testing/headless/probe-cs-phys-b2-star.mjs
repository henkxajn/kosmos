// KOSMOS — CS-PHYS-b2 sonda: najbardziej wewnętrzne peryhelium planet vs rdzeń / sfera kliku gwiazdy (× skala układu).
import './env.js';
import EntityManager from '../../core/EntityManager.js';
import { SystemGenerator } from '../../generators/SystemGenerator.js';
import { GalaxyGenerator } from '../../generators/GalaxyGenerator.js';
import { StarSystemManager } from '../../systems/StarSystemManager.js';
const SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const WU_PER_AU = 110 / 10;
const quietly = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
let worst = { ratio: Infinity }, n = 0, viol = 0, minL = Infinity;
for (const seed of SEEDS) {
  quietly(() => {
    EntityManager.clear();
    const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true, climateModel: 2, orbitModel: 2 });
    const ssm = new StarSystemManager();
    ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
    const gd = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true, climateModel: 2, orbitModel: 2 });
    for (const gs of gd.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, gd);
  });
  for (const star of EntityManager.getByType('star')) {
    const r = Math.max(0.6, Math.min(1.6, 0.6 + (star.mass ?? 1) * 0.6)) * star.systemScale;
    const coreAU = r * 3 / WU_PER_AU, clickAU = r * 2.5 / WU_PER_AU, quadAU = r * 3.6 * 1.1 / WU_PER_AU;
    for (const p of EntityManager.getByTypeInSystem('planet', star.systemId)) {
      const peri = p.orbital.a * (1 - (p.orbital.e ?? 0)) - (p.visual?.radius ?? 10) / 110 / 200 * 0;
      n++; const ratio = peri / Math.max(coreAU, clickAU);
      if (ratio < 1) viol++;
      if (ratio < worst.ratio) worst = { ratio, cls: star.spectralType, L: star.luminosity, mass: star.mass, k: star.systemScale, peri, coreAU, clickAU };
    }
    minL = Math.min(minL, star.luminosity);
  }
}
console.log(JSON.stringify({ planets: n, insideCoreOrClick: viol, minL, worst }));
