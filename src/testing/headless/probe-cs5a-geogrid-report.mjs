// ARC COLONY SPHERE CS-5a — RAPORT siatki geodezyjnej na TYCH SAMYCH ciałach co dzisiejszy PlanetMapGenerator:
//   (1) udziały terenów per archetyp: płaska vs geo (generateGeoGrid = classify(evalAt(środek pola))), mediana / min / max
//       udziału zabudowywalnego; terran oceniany wg D-CS-20 (mniej pól zabudowywalnych zaakceptowane);
//   (2) liczba pól zabudowywalnych per klasa rozmiaru (D-CS-8: ±20% dzisiejszej średniej) — RAPORT, bez strojenia;
//   (3) pasy szerokości: udział polarnych / przedbiegunowych per klasa vs GEO_LATITUDE_SHARES;
//   (4) anomalie: liczba i udział na pięciokątach; (5) strefa lądowania (D-CS-9) z kolonią w środku (stolica + 6 budynków).
//
//   node src/testing/headless/probe-cs5a-geogrid-report.mjs [--seeds a,b] [--per 30] [--json plik]

import './env.js';
import { writeFileSync } from 'node:fs';
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };

const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');
const { TERRAIN_TYPES }     = await import('../../map/HexTile.js');
const { ARCHETYPE_BY_ID }   = await import('../../data/BodyArchetypes.js');
const { generateGeoGrid, geoGridSpecFor } = await import('../../map/GeoColonyGridGenerator.js');
const { tileGraphOf, LATITUDE_BAND } = await import('../../map/TileGraph.js');
const { GEO_LATITUDE_SHARES } = await import('../../data/LatitudeBands.js');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SEEDS = arg('--seeds', '-2102099243,612055237').split(',').map(Number);
const PER = +arg('--per', 30);
const TERR = ['plains', 'forest', 'desert', 'tundra', 'ice_sheet', 'wasteland', 'crater', 'mountains', 'volcano', 'ocean'];
const buildable = (t) => TERRAIN_TYPES[t]?.buildable === true;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

const per = {};      // archetyp → { today: [shares], geo: [shares] }
const cls = {};      // klasa → liczniki
const anomalies = { total: 0, onPent: 0, grids: 0 };
const landing = [];
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
      const spec = geoGridSpecFor(b);
      if (!spec) continue;
      const rec = per[spec.arch.id] ??= { today: [], geo: [] };
      if (rec.today.length >= PER * SEEDS.length) continue;
      const flat = PlanetMapGenerator.generate(b, false);
      const geo = generateGeoGrid(b, false);
      const cnt = (grid) => { const c = {}; let n = 0; tileGraphOf(grid).forEachTile(t => { c[t.type] = (c[t.type] ?? 0) + 1; n++; }); return { c, n }; };
      const F = cnt(flat), G = cnt(geo);
      rec.today.push(Object.fromEntries(TERR.map(t => [t, (F.c[t] ?? 0) / F.n])));
      rec.geo.push(Object.fromEntries(TERR.map(t => [t, (G.c[t] ?? 0) / G.n])));
      const k = cls[spec.gridClass] ??= { todayBuild: [], geoBuild: [], todayN: [], geoN: G.n, polar: 0, sub: 0, tiles: 0 };
      k.todayBuild.push(TERR.filter(buildable).reduce((a, t) => a + (F.c[t] ?? 0), 0));
      k.geoBuild.push(TERR.filter(buildable).reduce((a, t) => a + (G.c[t] ?? 0), 0));
      k.todayN.push(F.n);
      const gg = tileGraphOf(geo);
      gg.forEachTile(t => { const band = gg.latitudeBand(t); k.tiles++; if (band === LATITUDE_BAND.POLAR) k.polar++; else if (band === LATITUDE_BAND.SUBPOLAR) k.sub++; });
      anomalies.grids++;
      gg.forEachTile(t => { if (t.anomaly) { anomalies.total++; if (gg.isPentagon(t)) anomalies.onPent++; } });
      // Strefa lądowania: stolica na polu równikowym + 6 budynków w promieniu 2 (pierwsze zabudowywalne).
      const cap = gg.equatorTile(); cap.capitalBase = true; cap.owner = 'player';
      let placed = 0;
      for (const t of gg.within(cap, 2)) { if (placed >= 6 || t === cap || !buildable(t.type)) continue; t.buildingId = 'farm'; t.owner = 'player'; placed++; }
      let lc = 0, lp = 0;
      gg.forEachTile(t => { if (gg.isLandingEdge(t)) { lc++; if (gg.isPentagon(t)) lp++; } });
      landing.push({ cls: spec.gridClass, count: lc, pent: lp, total: G.n });
    }
  }
}

const pc = (v) => (100 * v).toFixed(0);
const rows = [];
for (const [id, rec] of Object.entries(per)) {
  const bT = rec.today.map(s => TERR.filter(buildable).reduce((a, t) => a + s[t], 0));
  const bG = rec.geo.map(s => TERR.filter(buildable).reduce((a, t) => a + s[t], 0));
  const shareG = Object.fromEntries(TERR.map(t => [t, med(rec.geo.map(s => s[t]))]));
  rows.push({ id, n: rec.today.length, todayBuildMed: +med(bT).toFixed(3), geoBuildMin: +Math.min(...bG).toFixed(3),
    geoBuildMed: +med(bG).toFixed(3), geoBuildMax: +Math.max(...bG).toFixed(3),
    geoTop: TERR.filter(t => shareG[t] >= 0.05).sort((a, b) => shareG[b] - shareG[a]).map(t => `${t} ${pc(shareG[t])}`).join(', ') });
}
const order = Object.keys(ARCHETYPE_BY_ID);
rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
console.log('\n(1) Terrain shares per archetype (buildable share: today median -> geo min / median / max)');
for (const r of rows) console.log(`  ${r.id.padEnd(16)} n=${String(r.n).padStart(3)}  today ${pc(r.todayBuildMed).padStart(3)}% -> geo ${pc(r.geoBuildMin)}/${pc(r.geoBuildMed)}/${pc(r.geoBuildMax)}%   ${r.geoTop}`);

console.log('\n(2) Buildable tiles per size class (D-CS-8 within 20% of the mean today) + (3) latitude bands');
const clsRows = [];
for (const [c, k] of Object.entries(cls)) {
  const t = mean(k.todayBuild), g = mean(k.geoBuild), rel = t > 0 ? g / t - 1 : NaN;
  const sh = GEO_LATITUDE_SHARES[c];
  const row = { cls: c, bodies: k.todayBuild.length, todayTiles: +mean(k.todayN).toFixed(0), geoTiles: k.geoN,
    todayBuildable: +t.toFixed(1), geoBuildable: +g.toFixed(1), rel: +rel.toFixed(3), within20: Math.abs(rel) <= 0.2,
    polar: +(k.polar / k.tiles).toFixed(3), polarTarget: sh.polar, sub: +(k.sub / k.tiles).toFixed(3), subTarget: sh.subpolar };
  clsRows.push(row);
  console.log(`  ${c.padEnd(12)} bodies ${String(row.bodies).padStart(3)}  tiles ${row.todayTiles}->${row.geoTiles}  buildable ${row.todayBuildable}->${row.geoBuildable} (${(rel * 100).toFixed(0)}%${row.within20 ? '' : ' FLAG'})  polar ${pc(row.polar)}% (target ${pc(sh.polar)})  subpolar ${pc(row.sub)}% (target ${pc(sh.subpolar)})`);
}
console.log(`\n(4) Anomalies: ${anomalies.total} on ${anomalies.grids} grids, on pentagons ${anomalies.onPent} (${pc(anomalies.onPent / Math.max(1, anomalies.total))}%)`);
const byCls = {};
for (const l of landing) { const b = byCls[l.cls] ??= { n: 0, count: [], pent: 0, total: l.total }; b.n++; b.count.push(l.count); b.pent += l.pent; }
console.log('(5) Landing tiles with a colony (capital + 6 buildings within 2), D-CS-9 k=2:');
for (const [c, b] of Object.entries(byCls)) console.log(`  ${c.padEnd(12)} median ${med(b.count)} / ${b.total} tiles (min ${Math.min(...b.count)}), pentagons among landing tiles ${pc(b.pent / Math.max(1, b.count.reduce((x, y) => x + y, 0)))}% (pentagons are ${pc(12 / b.total)}% of tiles)`);
const out = arg('--json', null);
if (out) writeFileSync(out, JSON.stringify({ rows, clsRows, anomalies, landing: byCls }, null, 1));
