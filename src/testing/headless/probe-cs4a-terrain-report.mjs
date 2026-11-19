// ARC COLONY SPHERE CS-4a — RAPORT (bez strojenia): udziały terenów per archetyp — dzisiejszy PlanetMapGenerator
// vs SurfaceField (classify(evalAt) w punktach Fibonacciego o liczbie kafli z D-CS-8) na TYCH SAMYCH ciałach,
// plus rozrzut po ziarnach (min / mediana / max udziału zabudowywalnego). Flaga: mediana zabudowywalnego udziału
// odchodzi o > ±20% (względnie) od dzisiejszej — informacja dla D-CS-8 / CS-5, nie zmiana teraz.
//
//   node src/testing/headless/probe-cs4a-terrain-report.mjs [--seeds a,b] [--per 30] [--cut 0.05] [--json plik]

import './env.js';
import { writeFileSync } from 'node:fs';
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };

const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');
const { TERRAIN_TYPES }     = await import('../../map/HexTile.js');
const { ARCHETYPE_BY_ID, GRID_TILE_COUNTS } = await import('../../data/BodyArchetypes.js');
const { gridClassFor, planetoidPaletteOf } = await import('../../utils/BodyArchetypeLogic.js');
const SF = await import('../../utils/SurfaceField.js');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SEEDS = arg('--seeds', '-2102099243,612055237').split(',').map(Number);
const PER = +arg('--per', 30);
const CUT = +arg('--cut', 0.05);   // próg udziału terenu w kolumnach „top" (CS-6b: --cut 0.01 pokazuje pełny podział lądu)
const TERR = ['plains', 'forest', 'desert', 'tundra', 'ice_sheet', 'wasteland', 'crater', 'mountains', 'volcano', 'ocean'];
const buildable = (t) => TERRAIN_TYPES[t]?.buildable === true;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const PTS = new Map();
const ptsFor = (n) => { if (!PTS.has(n)) PTS.set(n, SF.fibonacciSphere(n)); return PTS.get(n); };

const per = {};   // archetyp → { today: [shares], next: [shares] }
for (const gs of SEEDS) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed: gs, seeded: true });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxy = GalaxyGenerator.generate(gs, home.star.name, home.star.spectralType, { seededSystems: true });
  ssm.assignMissingSurfaceSeeds(galaxy.seed);
  ssm.assignMissingArchetypes();
  for (const s of galaxy.systems) if (s.id !== 'sys_home') ssm.generateAndRegister(s, galaxy);
  for (const kind of ['planet', 'moon', 'planetoid']) {
    for (const b of EntityManager.getByType(kind)) {
      const arch = ARCHETYPE_BY_ID[b.bodyArchetype];
      if (!arch || arch.family === 'gas' || !Number.isFinite(b.surfaceSeed)) continue;
      const rec = per[arch.id] ??= { today: [], next: [] };
      if (rec.today.length >= PER * SEEDS.length) continue;
      // Dziś
      const counts = {}; let n = 0;
      PlanetMapGenerator.generate(b, false).forEach(t => { counts[t.type] = (counts[t.type] ?? 0) + 1; n++; });
      rec.today.push(Object.fromEntries(TERR.map(t => [t, (counts[t] ?? 0) / (n || 1)])));
      // SurfaceField
      const params = { waterCoverage: b.waterCoverage ?? null, palette: kind === 'planetoid' ? planetoidPaletteOf(b) : null };
      const N = GRID_TILE_COUNTS[gridClassFor(arch.id, b)] ?? 162, P = ptsFor(N), sea = SF.seaLevelOf(b.surfaceSeed, arch, params);
      const c2 = {};
      for (let i = 0; i < N; i++) { const r = SF.classify(SF.evalAt(b.surfaceSeed, arch, params, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), arch, sea); c2[r.terrain] = (c2[r.terrain] ?? 0) + 1; }
      rec.next.push(Object.fromEntries(TERR.map(t => [t, (c2[t] ?? 0) / N])));
    }
  }
}

const rows = [];
const pc = (v) => (100 * v).toFixed(0);
for (const [id, rec] of Object.entries(per)) {
  const bT = rec.today.map(s => TERR.filter(buildable).reduce((a, t) => a + s[t], 0));
  const bN = rec.next.map(s => TERR.filter(buildable).reduce((a, t) => a + s[t], 0));
  const shareT = Object.fromEntries(TERR.map(t => [t, med(rec.today.map(s => s[t]))]));
  const shareN = Object.fromEntries(TERR.map(t => [t, med(rec.next.map(s => s[t]))]));
  const mT = med(bT), mN = med(bN);
  const rel = mT > 0 ? mN / mT - 1 : (mN > 0 ? Infinity : 0);
  rows.push({
    id, n: rec.today.length,
    todayBuildMed: +mT.toFixed(3), newBuildMin: +Math.min(...bN).toFixed(3), newBuildMed: +mN.toFixed(3), newBuildMax: +Math.max(...bN).toFixed(3),
    relChange: +rel.toFixed(3), flag: Math.abs(rel) > 0.2,
    todayTop: TERR.filter(t => shareT[t] >= CUT).sort((a, b) => shareT[b] - shareT[a]).map(t => `${t} ${pc(shareT[t])}`).join(', '),
    newTop: TERR.filter(t => shareN[t] >= CUT).sort((a, b) => shareN[b] - shareN[a]).map(t => `${t} ${pc(shareN[t])}`).join(', '),
  });
}
const order = Object.keys(ARCHETYPE_BY_ID);
rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
console.log(`buildable = ${TERR.filter(buildable).join(', ')} · galaxies ${SEEDS.join(', ')} · ≤ ${PER} bodies per archetype per galaxy`);
for (const r of rows) {
  console.log(`| ${r.id} | ${r.n} | ${pc(r.todayBuildMed)}% | ${pc(r.newBuildMin)} / ${pc(r.newBuildMed)} / ${pc(r.newBuildMax)}% | ${r.relChange > 0 ? '+' : ''}${(100 * r.relChange).toFixed(0)}%${r.flag ? ' ⚠' : ''} | ${r.todayTop} | ${r.newTop} |`);
}
const json = arg('--json', null);
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
