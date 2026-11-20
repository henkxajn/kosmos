// ARC COLONY SPHERE CS-5a — keeper siatki geodezyjnej (GeodesicTopology + GeodesicTileGraph + GeodesicGrid +
// GeoColonyGridGenerator + ColonyGridFactory). Plan §3.13.
//
//   G1  topologia: 10n²+2 pól, 12 pięciokątów (ids 0…11), reszta 6 sąsiadów, symetria, kolejność cykliczna, środki
//       jednostkowe, spójność, odległość = BFS (symetria, sąsiedzi różnią się o ≤ 1)
//   G2  determinizm: dwa budowania, worker_threads vs główny wątek (topologia + teren), stałe wektory (hash)
//   G3  A*: optymalny vs BFS na losowych maskach, ścieżka poprawna, deterministyczna; prostoliniowość lepsza niż naiwny
//       remis (Finding 781)
//   G4  pasy szerokości: monotoniczne w |y| środka, udziały ≈ GEO_LATITUDE_SHARES klasy, graf = reguła ze środka
//   G5  strefa lądowania D-CS-9: odległość ≥ k od zajętych pól, NIE „< 6 sąsiadów", bez skupiania na pięciokątach
//   G6  stepDirection bez szwu, zwrot z kierunku wschodniego; equatorTile = min |y|; anyTile
//   G7  teren = classify(evalAt(środek)) (D-CS-3), 10 terenów, anomalie z pierwszeństwem pięciokątów, n per klasa (D-CS-8)
//   G8  interfejs TileGraph na siatce geo: id "g<i>", klucze z prefiksem, tileGraphOf, brak dziedziczenia po płaskim
//   G9  ColonyGridFactory: flaga OFF → płaska zawsze; ON bez zgody środowiska → płaska; ON + zgoda → geo (gaz płaski)
//   G10 piny źródła: flaga default OFF, topologia bez importów i trygonometrii, żaden system nie woła generatora geo
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-5a) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as TG from '../../map/TileGraph.js';
import { HexGrid } from '../../map/HexGrid.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const tryImport = async (p) => { try { return await import(p); } catch { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const TOPO = await tryImport('../../map/GeodesicTopology.js');
const GRID = await tryImport('../../map/GeodesicGrid.js');
const GEN = await tryImport('../../map/GeoColonyGridGenerator.js');
const FAC = await tryImport('../../map/ColonyGridFactory.js');
const LB = await tryImport('../../data/LatitudeBands.js');
const RULES = await tryImport('../../data/GeoGridRules.js');
const SF = await import('../../utils/SurfaceField.js');
const { ARCHETYPE_BY_ID } = await import('../../data/BodyArchetypes.js');
const NS = [3, 4, 5, 6];

// FNV-1a po bajtach (Float64 i Int32).
function hashOf(parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const bytes = new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  }
  return h.toString(16).padStart(8, '0');
}
const topoHash = (t) => hashOf([t.cx, t.cy, t.cz, t.nbStart, t.nbList]);
let seed = 0x2545f491;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ── G1 topologia ─────────────────────────────────────────────────────────────
console.log('G1 topology');
for (const n of NS) {
  const t = TOPO?.geodesicTopology(n);
  if (!t) { assert(false, `G1 n=${n} topology module`); continue; }
  const N = 10 * n * n + 2;
  let pent = [], badDeg = 0, asym = 0, notCyclic = 0, notUnit = 0, badDist = 0, asymDist = 0;
  for (let i = 0; i < t.count; i++) {
    const nb = t.neighbors(i);
    if (nb.length === 5) pent.push(i); else if (nb.length !== 6) badDeg++;
    for (const j of nb) if (!t.neighbors(j).includes(i)) asym++;
    for (let m = 0; m < nb.length; m++) if (!t.neighbors(nb[m]).includes(nb[(m + 1) % nb.length])) notCyclic++;
    if (Math.abs(Math.hypot(t.cx[i], t.cy[i], t.cz[i]) - 1) > 1e-12) notUnit++;
    for (let j = 0; j < t.count; j++) {
      if (t.distance(i, j) !== t.distance(j, i)) asymDist++;
      if (t.distance(i, j) === 255) badDist++;
      for (const k of nb) if (Math.abs(t.distance(i, j) - t.distance(k, j)) > 1) badDist++;
    }
  }
  assert(t.count === N && TOPO.geodesicTileCount(n) === N && TOPO.geodesicNForCount(N) === n, `G1a n=${n}: ${t.count} tiles = 10n²+2 = ${N}`);
  assert(pent.length === 12 && pent.every((v, k) => v === k) && badDeg === 0, `G1b n=${n}: 12 pentagons at ids 0..11 (${pent.length}), others degree 6 (bad ${badDeg})`);
  assert(asym === 0 && notCyclic === 0, `G1c n=${n}: neighbour symmetry (asym ${asym}), cyclic order (consecutive neighbours adjacent; bad ${notCyclic})`);
  assert(notUnit === 0 && badDist === 0 && asymDist === 0 && t.distance(0, 0) === 0, `G1d n=${n}: unit centres (${notUnit}), connected + distance metric (bad ${badDist}, asym ${asymDist})`);
}

// ── G2 determinizm ───────────────────────────────────────────────────────────
console.log('G2 determinism');
const TERRAN_BODY = { id: 'k1', name: 'K1', type: 'planet', planetType: 'rocky', bodyArchetype: 'terran', surfaceSeed: 0x1234567, waterCoverage: 0.55, physics: { mass: 1 }, composition: {}, lifeScore: 60 };
const MOON_BODY = { id: 'k2', name: 'K2', type: 'moon', planetType: 'rocky', bodyArchetype: 'icy_cratered', surfaceSeed: 0x9abcdef, physics: { mass: 0.02 }, composition: {} };
const ROID_BODY = { id: 'k3', name: 'K3', type: 'planetoid', planetType: 'rocky', planetoidType: 'metallic', bodyArchetype: 'planetoid', surfaceSeed: 0x5555aaa, physics: { mass: 0.001 }, composition: { Fe: 30 } };
const BIG_BODY = { ...TERRAN_BODY, id: 'k4', bodyArchetype: 'desert', surfaceSeed: 77, physics: { mass: 3 } };
const hashes = {};
if (TOPO) {
  const fresh = await tryImport('../../map/GeodesicTopology.js?fresh=1');
  for (const n of NS) hashes[n] = topoHash(TOPO.geodesicTopology(n));
  const again = NS.map(n => topoHash(fresh.geodesicTopology(n)));
  assert(NS.every((n, k) => again[k] === hashes[n]), `G2a two independent builds identical (${NS.map(n => hashes[n]).join(' ')})`);
} else assert(false, 'G2a topology module');
const terrainList = (body) => { const spec = GEN?.geoGridSpecFor(body); return spec ? GEN.geoTerrainOf(body, spec) : null; };
const mainTerrain = [TERRAN_BODY, MOON_BODY, ROID_BODY].map(b => terrainList(b)?.join(',') ?? null);
// Worker: tylko moduły czyste (topologia + SurfaceField + dane archetypów) — ta sama formuła co geoTerrainOf.
const workerSrc = `
  import { parentPort, workerData } from 'node:worker_threads';
  const T = await import(workerData.topo); const SF = await import(workerData.sf); const { ARCHETYPE_BY_ID } = await import(workerData.arch);
  const hash = (parts) => { let h = 0x811c9dc5; for (const p of parts) { const b = new Uint8Array(p.buffer, p.byteOffset, p.byteLength); for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } } return h.toString(16).padStart(8, '0'); };
  const topo = workerData.ns.map(n => { const t = T.geodesicTopology(n); return hash([t.cx, t.cy, t.cz, t.nbStart, t.nbList]); });
  const terr = workerData.bodies.map(b => { const t = T.geodesicTopology(b.n); const a = ARCHETYPE_BY_ID[b.arch]; const sea = SF.seaLevelOf(b.seed, a, b.params);
    const out = []; for (let i = 0; i < t.count; i++) out.push(SF.classify(SF.evalAt(b.seed, a, b.params, t.cx[i], t.cy[i], t.cz[i]), a, sea).terrain); return out.join(','); });
  parentPort.postMessage({ topo, terr });`;
let workerRes = null;
if (TOPO && GEN) {
  const bodies = [TERRAN_BODY, MOON_BODY, ROID_BODY].map(b => { const s = GEN.geoGridSpecFor(b); return { n: s.n, arch: s.arch.id, seed: b.surfaceSeed >>> 0, params: s.params }; });
  try {
    workerRes = await new Promise((res, rej) => {
      const w = new Worker(new URL('data:text/javascript,' + encodeURIComponent(workerSrc)), { workerData: {
        topo: pathToFileURL(path.join(ROOT, 'src/map/GeodesicTopology.js')).href, sf: pathToFileURL(path.join(ROOT, 'src/utils/SurfaceField.js')).href,
        arch: pathToFileURL(path.join(ROOT, 'src/data/BodyArchetypes.js')).href, ns: NS, bodies } });
      w.once('message', (m) => { res(m); w.terminate(); }); w.once('error', rej);
    });
  } catch (e) { console.log('    worker error', e?.message ?? e); }
}
assert(!!workerRes && NS.every((n, k) => workerRes.topo[k] === hashes[n]), `G2b worker_threads topology = main thread (${workerRes?.topo?.join(' ')})`);
assert(!!workerRes && mainTerrain.every((s, k) => s !== null && s === workerRes.terr[k]), `G2c worker_threads terrain = main thread geoTerrainOf (3 bodies: terran, icy moon, planetoid)`);
// Stałe wektory: zmiana konstrukcji, kolejności sąsiadów albo pola powierzchni = czerwony (aktualizować świadomie).
const PIN_TOPO = { 3: '9496c260', 4: '13281f65', 5: '174a1a54', 6: '1c24f6de' };
const PIN_TERRAIN = '07227ae3';
const terrainHash = hashOf([new Int32Array(mainTerrain.join('|').split('').map(c => c.charCodeAt(0)))]);
console.log(`    topology hashes ${JSON.stringify(hashes)} · terrain hash ${terrainHash}`);
assert(NS.every(n => hashes[n] === PIN_TOPO[n]), `G2d topology fixed vectors (pinned hashes per n)`);
assert(terrainHash === PIN_TERRAIN, `G2e terrain fixed vector (3 bodies, pinned hash ${PIN_TERRAIN})`);

// ── G3 A* ────────────────────────────────────────────────────────────────────
console.log('G3 A* vs BFS + straightness');
const bfs = (t, a, b, pass) => {
  if (a === b) return 0;
  const d = new Int32Array(t.count).fill(-1); d[a] = 0; const q = [a];
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of t.neighbors(u)) { if (d[v] >= 0 || !pass(v)) continue; d[v] = d[u] + 1; if (v === b) return d[v]; q.push(v); } }
  return -1;
};
const meanDev = (t, a, b, p) => { const nrm = t.greatCircleNormal(a, b); if (!nrm) return 0; let s = 0; for (const v of p) s += t._dev(v, nrm[0], nrm[1], nrm[2]); return s / Math.max(1, p.length); };
for (const n of NS) {
  const t = TOPO?.geodesicTopology(n);
  if (!t) { assert(false, `G3 n=${n}`); continue; }
  let cases = 0, blockedNull = 0, badLen = 0, badPath = 0, nondet = 0;
  for (let c = 0; c < 400; c++) {
    const mask = new Uint8Array(t.count); for (let i = 0; i < t.count; i++) mask[i] = rnd() < 0.28 ? 0 : 1;
    const a = Math.floor(rnd() * t.count), b = Math.floor(rnd() * t.count);
    mask[a] = 1;
    const pass = (v) => mask[v] === 1;
    const p = t.path(a, b, pass);
    const ref = bfs(t, a, b, pass);
    cases++;
    if (ref < 0) { if (p !== null) badLen++; else blockedNull++; continue; }
    if (!p || p.length !== ref) { badLen++; continue; }
    let prev = a, ok = p.length === 0 ? a === b : p[p.length - 1] === b;
    for (const v of p) { if (!t.neighbors(prev).includes(v) || !pass(v)) ok = false; prev = v; }
    if (!ok) badPath++;
    if (JSON.stringify(t.path(a, b, pass)) !== JSON.stringify(p)) nondet++;
  }
  assert(badLen === 0 && badPath === 0 && nondet === 0 && blockedNull > 0, `G3a n=${n}: ${cases} random masks — length = BFS, valid steps, deterministic (unreachable ${blockedNull} → null; bad len ${badLen}, bad path ${badPath}, nondet ${nondet})`);
  let sS = 0, sN = 0, k = 0, worse = 0;
  for (let c = 0; c < 300; c++) {
    const a = Math.floor(rnd() * t.count), b = Math.floor(rnd() * t.count);
    if (t.distance(a, b) < 3) continue;
    const ps = t.path(a, b), pn = t.path(a, b, () => true, 2000, { straight: false });
    if (ps.length !== pn.length) worse += 1000;
    const ds = meanDev(t, a, b, ps), dn = meanDev(t, a, b, pn);
    sS += ds; sN += dn; k++; if (ds > dn + 1e-12) worse++;
  }
  const ratio = sS / sN;
  console.log(`    n=${n}: mean great-circle deviation straight ${(sS / k).toFixed(4)} vs naive ${(sN / k).toFixed(4)} (ratio ${ratio.toFixed(3)}, straight worse on ${worse}/${k})`);
  assert(k > 100 && ratio < 0.8 && worse < k * 0.1, `G3b n=${n}: straight tie-break deviates less than the naive one (ratio ${ratio.toFixed(3)} < 0.8; same lengths)`);
}

// ── G4 pasy szerokości ───────────────────────────────────────────────────────
console.log('G4 latitude bands');
const CLASS_N = { planetoid: 3, moon: 3, hot_rocky: 4, small_rocky: 4, large_rocky: 5, largest_cap: 6 };
for (const [cls, n] of Object.entries(CLASS_N)) {
  if (!GRID || !LB?.GEO_LATITUDE_SHARES) { assert(false, `G4 ${cls}`); continue; }
  const grid = new GRID.GeodesicGrid(n, { gridClass: cls });
  const g = TG.tileGraphOf(grid);
  const t = TOPO.geodesicTopology(n);
  const B = TG.LATITUDE_BAND;
  let p = 0, s = 0, mono = true, rule = 0;
  const minY = { [B.POLAR]: 2, [B.SUBPOLAR]: 2, [B.EQUATORIAL]: 2 }, maxY = { [B.POLAR]: -1, [B.SUBPOLAR]: -1, [B.EQUATORIAL]: -1 };
  g.forEachTile(tile => {
    const band = g.latitudeBand(tile), ay = Math.abs(t.cy[tile.q]);
    minY[band] = Math.min(minY[band], ay); maxY[band] = Math.max(maxY[band], ay);
    const exp = ay >= grid.latCutoffs.polar ? B.POLAR : ay >= grid.latCutoffs.subpolar ? B.SUBPOLAR : B.EQUATORIAL;
    if (exp !== band || g.latitudeBand(g.idOf(tile)) !== band) rule++;
    if (band === B.POLAR) p++; else if (band === B.SUBPOLAR) s++;
  });
  if (p && minY[B.POLAR] < maxY[B.SUBPOLAR]) mono = false;
  if (s && minY[B.SUBPOLAR] < maxY[B.EQUATORIAL]) mono = false;
  const sh = LB.GEO_LATITUDE_SHARES[cls];
  const N = t.count;
  const dp = Math.abs(p / N - sh.polar), ds = Math.abs((p + s) / N - sh.polar - sh.subpolar);
  assert(mono && rule === 0 && dp <= 0.05 && ds <= 0.06 && p > 0 && s > 0,
    `G4 ${cls} (n=${n}): polar ${(100 * p / N).toFixed(1)}% (target ${(100 * sh.polar).toFixed(1)}), polar+subpolar ${(100 * (p + s) / N).toFixed(1)}% (target ${(100 * (sh.polar + sh.subpolar)).toFixed(1)}); monotone in |y| ${mono}; graph = centre rule (bad ${rule})`);
}

// G4c — tabela GEO_LATITUDE_SHARES = dzisiejsze udziały rzędów polarnych / przedbiegunowych PRAWDZIWEGO PlanetMapGenerator
// (te same ciała co pomiar w LatitudeBands.js) — zmiana tabeli bez nowego pomiaru jest czerwona.
{
  const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');
  const flatShares = (bodies) => {
    let P = 0, S = 0;
    for (const b of bodies) {
      const g = PlanetMapGenerator.generate({ id: 'lat_' + b.type + b.pt + b.m, type: b.type, planetType: b.pt, physics: { mass: b.m }, composition: {}, temperatureC: 15 }, false);
      let p = 0, s = 0, n = 0; g.forEach(t => { n++; if (t.r === 0 || t.r === g.height - 1) p++; else if (t.r === 1 || t.r === g.height - 2) s++; });
      P += p / n; S += s / n;
    }
    return { polar: P / bodies.length, subpolar: S / bodies.length };
  };
  const pl = (pt, ms) => ms.map(m => ({ type: 'planet', pt, m }));
  const SETS = {
    planetoid: [{ type: 'planetoid', pt: 'rocky', m: 0.001 }], moon: [{ type: 'moon', pt: 'rocky', m: 0.01 }],
    hot_rocky: pl('hot_rocky', [1]), small_rocky: [0.3, 0.5, 0.8, 1, 1.2, 1.5].flatMap(m => [...pl('rocky', [m]), ...pl('ice', [m])]),
    large_rocky: pl('rocky', [2, 3, 5, 8]),
  };
  let bad = [];
  for (const [cls, set] of Object.entries(SETS)) {
    const f = flatShares(set), t = LB?.GEO_LATITUDE_SHARES?.[cls];
    if (!t || Math.abs(f.polar - t.polar) > 0.002 || Math.abs(f.subpolar - t.subpolar) > 0.002) bad.push(`${cls} ${f.polar.toFixed(4)}/${f.subpolar.toFixed(4)} vs ${t?.polar}/${t?.subpolar}`);
  }
  assert(bad.length === 0 && LB?.GEO_LATITUDE_SHARES?.largest_cap?.polar === LB?.GEO_LATITUDE_SHARES?.large_rocky?.polar,
    `G4c GEO_LATITUDE_SHARES = measured flat shares of today's generator per class (±0.002)${bad.length ? ' — ' + bad.join('; ') : ''}`);
}

// ── G5 strefa lądowania ──────────────────────────────────────────────────────
console.log('G5 landing zone (D-CS-9)');
for (const n of NS) {
  if (!GRID || !RULES) { assert(false, `G5 n=${n}`); continue; }
  const grid = new GRID.GeodesicGrid(n);
  const g = TG.tileGraphOf(grid);
  const all = g.tiles();
  assert(all.every(x => g.isLandingEdge(x)) && RULES.GEO_LANDING_MIN_DISTANCE === 2, `G5a n=${n}: empty body → every tile is a landing tile (${all.length}); k = GEO_LANDING_MIN_DISTANCE = 2 (D-CS-9 data)`);
  // Kolonia: stolica na pięciokącie 0 (najgorszy przypadek dla reguły „< 6") + budynki w promieniu 1, budowa w odległości 3.
  const cap = g.tile('g0'); cap.capitalBase = true; cap.owner = 'player';
  for (const x of g.ring(cap, 1)) { x.buildingId = 'farm'; x.owner = 'player'; }
  const far = g.ring(cap, 3)[0]; far.underConstruction = { buildingId: 'mine', progress: 0, buildTime: 1 };
  const held = all.filter(x => x.owner || x.buildingId || x.underConstruction || x.capitalBase);
  let bad = 0, landing = 0, pentLanding = 0, pentNot = 0, hexLanding = 0;
  for (const x of all) {
    const exp = held.every(h => g.distance(x, h) >= RULES.GEO_LANDING_MIN_DISTANCE);
    const got = g.isLandingEdge(x);
    if (exp !== got) bad++;
    if (got) { landing++; if (g.isPentagon(x)) pentLanding++; else hexLanding++; }
    else if (g.isPentagon(x)) pentNot++;
  }
  const pentShare = landing ? pentLanding / landing : 1, base = 12 / all.length;
  assert(bad === 0 && landing > 0 && pentNot >= 1 && hexLanding > 0 && pentShare <= base * 1.5,
    `G5b n=${n}: landing = distance ≥ ${RULES.GEO_LANDING_MIN_DISTANCE} from held tiles (bad ${bad}); ${landing} landing tiles, pentagon share ${(100 * pentShare).toFixed(1)}% vs ${(100 * base).toFixed(1)}% base; a pentagon is NOT landing (${pentNot}), hexagons are (${hexLanding}) — not the "< 6 neighbours" rule`);
}

// ── G6 krok, równik, anyTile ─────────────────────────────────────────────────
console.log('G6 stepDirection / equatorTile / anyTile');
for (const n of NS) {
  if (!GRID) { assert(false, `G6 n=${n}`); continue; }
  const grid = new GRID.GeodesicGrid(n);
  const g = TG.tileGraphOf(grid);
  const t = TOPO.geodesicTopology(n);
  let seam = 0, face = 0, pairs = 0;
  g.forEachTile(a => { for (const b of g.neighbors(a)) {
    const d = g.stepDirection(a, b); pairs++;
    if (d.crossesSeam !== false) seam++;
    const east = (t.cx[b.q] - t.cx[a.q]) * -t.cz[a.q] + (t.cz[b.q] - t.cz[a.q]) * t.cx[a.q];
    if (d.facingLeft !== (east < 0)) face++;
  } });
  const eq = g.equatorTile();
  const minAbs = Math.min(...Array.from(t.cy, v => Math.abs(v)));
  assert(seam === 0 && face === 0 && pairs > 0 && Math.abs(t.cy[eq.q]) === minAbs && g.anyTile() === grid.tiles[0],
    `G6 n=${n}: ${pairs} steps never cross a seam (${seam}), facing = east projection (bad ${face}); equatorTile |y| = min (${Math.abs(t.cy[eq.q]).toFixed(4)}); anyTile = tile 0`);
}

// ── G7 teren, anomalie, rozmiar ─────────────────────────────────────────────
console.log('G7 terrain / anomalies / size');
if (GEN) {
  const TERRS = new Set(SF.GAMEPLAY_TERRAINS);
  for (const b of [TERRAN_BODY, MOON_BODY, ROID_BODY, BIG_BODY]) {
    const grid = GEN.generateGeoGrid(b, false);
    const spec = GEN.geoGridSpecFor(b);
    const t = TOPO.geodesicTopology(spec.n);
    const arch = ARCHETYPE_BY_ID[b.bodyArchetype];
    const sea = SF.seaLevelOf(b.surfaceSeed, arch, spec.params);
    let mism = 0, bad = 0;
    for (let i = 0; i < t.count; i++) {
      const exp = SF.classify(SF.evalAt(b.surfaceSeed, arch, spec.params, t.cx[i], t.cy[i], t.cz[i]), arch, sea).terrain;
      if (grid.tiles[i].type !== exp) mism++;
      if (!TERRS.has(grid.tiles[i].type)) bad++;
    }
    const again = GEN.generateGeoGrid(b, false);
    const same = again.tiles.every((x, i) => x.type === grid.tiles[i].type && x.anomaly === grid.tiles[i].anomaly);
    assert(mism === 0 && bad === 0 && same && grid.tiles.every(x => x.explored === false) && GEN.generateGeoGrid(b, true).tiles.every(x => x.explored),
      `G7a ${b.bodyArchetype} (${spec.gridClass}, n=${spec.n}): terrain = classify(evalAt(centre)) on all ${t.count} tiles (mismatch ${mism}, outside the 10 terrains ${bad}); deterministic; explored only on a home world`);
  }
  // Pierwszeństwo pięciokątów: syntetyczne ciało z wieloma kwalifikującymi się anomaliami; liczba ≤ limit.
  let total = 0, onPent = 0, grids = 0, overMax = 0;
  for (let s = 1; s <= 60; s++) {
    const b = { ...TERRAN_BODY, id: 'a' + s, surfaceSeed: s * 7919, bodyArchetype: s % 2 ? 'barren' : 'desert' };
    const grid = GEN.generateGeoGrid(b, false);
    const g = TG.tileGraphOf(grid);
    let c = 0; g.forEachTile(x => { if (x.anomaly) { c++; total++; if (g.isPentagon(x)) onPent++; } });
    if (c > 5) overMax++; grids++;
  }
  const share = onPent / Math.max(1, total);
  console.log(`    anomalies: ${total} on ${grids} grids, ${onPent} on pentagons (${(100 * share).toFixed(0)}%; pentagons are ${(100 * 12 / 252).toFixed(0)}% of tiles)`);
  assert(total > 0 && overMax === 0 && share > 0.3, `G7b anomalies prefer pentagons (${(100 * share).toFixed(0)}% > 30%), never above the per-type limit (${overMax})`);
  const gas = { ...TERRAN_BODY, type: 'planet', planetType: 'gas', bodyArchetype: Object.keys(ARCHETYPE_BY_ID).find(k => ARCHETYPE_BY_ID[k].family === 'gas') };
  const noArch = { ...TERRAN_BODY, bodyArchetype: null }, noSeed = { ...TERRAN_BODY, surfaceSeed: undefined };
  assert(GEN.generateGeoGrid(gas) === null && GEN.generateGeoGrid(noArch) === null && GEN.generateGeoGrid(noSeed) === null,
    'G7c gas giant / body without archetype / without surfaceSeed → null (caller keeps the flat grid)');
  const sz = [MOON_BODY, ROID_BODY, TERRAN_BODY, BIG_BODY].map(b => GEN.geoGridSpecFor(b).n);
  const cap = GEN.geoGridSpecFor(BIG_BODY, { largestHexMaps: true });
  assert(sz.join(',') === '3,3,4,5' && cap.n === 6 && cap.gridClass === 'largest_cap', `G7d n per class (D-CS-8): moon 3, planetoid 3, rocky 1 M⊕ 4, rocky 3 M⊕ 5, largestHexMaps → 6 (got ${sz.join(',')} / ${cap.n})`);
  // G7e — bliźniak reguły SurfaceCache (generator nie importuje SurfaceCache): ten sam archetyp i parametry na ciałach
  // wszystkich rodzin (z gazem, bez ziarna, typem spoza listy).
  {
    const SC = await import('../../systems/SurfaceCache.js');
    const gasId = Object.keys(ARCHETYPE_BY_ID).find(k => ARCHETYPE_BY_ID[k].family === 'gas');
    const probe = [TERRAN_BODY, MOON_BODY, ROID_BODY, BIG_BODY, { ...ROID_BODY, bodyArchetype: 'planetoid_icy' }, { ...TERRAN_BODY, bodyArchetype: gasId },
      { ...TERRAN_BODY, surfaceSeed: null }, { ...TERRAN_BODY, type: 'star' }, { ...MOON_BODY, waterCoverage: 0.3 }, null];
    const diff = probe.filter(b => SC.surfaceArchetypeOf(b) !== GEN.geoArchetypeOf(b)
      || (SC.surfaceArchetypeOf(b) && JSON.stringify(SC.surfaceParamsOf(b)) !== JSON.stringify(GEN.geoSurfaceParamsOf(b))));
    assert(diff.length === 0, `G7e geoArchetypeOf / geoSurfaceParamsOf = SurfaceCache.surfaceArchetypeOf / surfaceParamsOf on ${probe.length} bodies (diff ${diff.length})`);
  }
} else for (const l of ['G7a', 'G7b', 'G7c', 'G7d', 'G7e']) assert(false, `${l} generator module`);

// ── G8 interfejs ─────────────────────────────────────────────────────────────
console.log('G8 TileGraph interface on a geo grid');
if (GRID && TG.GeodesicTileGraph) {
  const grid = new GRID.GeodesicGrid(4);
  const g = TG.tileGraphOf(grid);
  const METHODS = ['tiles', 'forEachTile', 'anyTile', 'tile', 'idOf', 'parseKey', 'formatKey', 'neighbors', 'distance', 'within', 'ring', 'path',
    'latitudeBand', 'equatorTile', 'isLandingEdge', 'stepDirection'];
  const t17 = g.tile('g17');
  assert(g instanceof TG.GeodesicTileGraph && g.kind === 'geo' && TG.tileGraphOf(grid) === g && METHODS.every(m => typeof g[m] === 'function'),
    `G8a tileGraphOf(geo grid) → GeodesicTileGraph (cached), kind 'geo', all ${METHODS.length} interface methods`);
  assert(t17 && t17.q === 17 && t17.r === TG.GEO_TILE_R && g.idOf(t17) === 'g17' && g.idOf({ q: 17, r: TG.GEO_TILE_R }) === 'g17'
    && g.tile({ q: 17, r: TG.GEO_TILE_R }) === t17 && g.tile('17,0') === undefined && g.tile('g999') === undefined && g.tile({ q: 17, r: 0 }) === undefined,
    'G8b id "g<i>" ↔ tile (q = index, r = GEO_TILE_R); flat-style refs and out-of-range ids miss');
  const ck = g.formatKey(t17, TG.CAPITAL_PREFIX), bk = g.formatKey('g17', TG.BUILDING_PREFIX);
  assert(ck === 'capital_g17' && bk === 'building_g17' && TG.isCapitalKey(ck) && g.parseKey(bk).id === 'g17' && g.tile(g.parseKey(ck).id) === t17,
    'G8c prefixed keys capital_g17 / building_g17 round-trip through parseKey');
  const path = g.path('g0', 'g100');
  assert(Array.isArray(path) && path.length === g.distance('g0', 'g100') && path.every(s => s.r === TG.GEO_TILE_R) && path[path.length - 1].q === 100
    && g.within(t17, 1).length === 7 && g.ring('g0', 1).length === 5 && g.neighbors('g0').length === 5,
    `G8d path → [{q, r}] (${path?.length} steps = distance), within(hex,1) = 7, ring(pentagon,1) = 5`);
  let proto = Object.getPrototypeOf(g), inherits = false;
  while (proto) { if (proto === TG.FlatHexTileGraph.prototype) inherits = true; proto = Object.getPrototypeOf(proto); }
  const flat = TG.tileGraphOf(new HexGrid(8, 6, { tapered: true }));
  assert(!inherits && flat instanceof TG.FlatHexTileGraph && flat.kind === 'flat', 'G8e GeodesicTileGraph does not inherit from FlatHexTileGraph; a HexGrid still gets FlatHexTileGraph');
} else for (const l of ['G8a', 'G8b', 'G8c', 'G8d', 'G8e']) assert(false, `${l} geo graph`);

// ── G9 fabryka ───────────────────────────────────────────────────────────────
console.log('G9 ColonyGridFactory (interim rule until CS-7)');
if (FAC) {
  const bodies = [TERRAN_BODY, MOON_BODY, ROID_BODY, BIG_BODY];
  const gas = { ...TERRAN_BODY, planetType: 'gas', bodyArchetype: Object.keys(ARCHETYPE_BY_ID).find(k => ARCHETYPE_BY_ID[k].family === 'gas') };
  assert(FAC.geoGridsAllowed() === false && bodies.every(b => FAC.colonyGridKindFor(b) === 'flat'), 'G9a defaults (flag OFF, environment not allowed) → flat for every body');
  assert(bodies.every(b => FAC.colonyGridKindFor(b, { flag: false, allowed: true }) === 'flat'), 'G9b flag OFF + allowed → flat');
  assert(bodies.every(b => FAC.colonyGridKindFor(b, { flag: true, allowed: false }) === 'flat'), 'G9c flag ON + live game (not allowed) → flat');
  assert(bodies.every(b => FAC.colonyGridKindFor(b, { flag: true, allowed: true }) === 'geo') && FAC.colonyGridKindFor(gas, { flag: true, allowed: true }) === 'flat',
    'G9d flag ON + allowed → geo for planets / moons / planetoids, flat for a gas giant');
} else for (const l of ['G9a', 'G9b', 'G9c', 'G9d']) assert(false, `${l} factory`);

// ── G10 piny źródła ──────────────────────────────────────────────────────────
console.log('G10 source pins');
assert(GAME_CONFIG.FEATURES.colonySphere === false, 'G10a FEATURES.colonySphere exists and defaults to false');
const topoSrc = stripComments(src('src/map/GeodesicTopology.js'));
assert(topoSrc.length > 1000 && !/\bimport\b/.test(topoSrc) && !/Math\.(sin|cos|tan|atan2?|asin|acos|pow|exp|log\w*|hypot)\b|\*\*/.test(topoSrc),
  'G10b GeodesicTopology: no imports, no trig / pow / exp / log / ** (arithmetic + sqrt only)');
const tgSrc = stripComments(src('src/map/TileGraph.js'));
const geoBody = tgSrc.slice(tgSrc.indexOf('class GeodesicTileGraph'), tgSrc.indexOf('const _graphs'));
assert(geoBody.length > 500 && !/Math\.(sin|cos|tan|atan2?|asin|acos|pow|exp|log\w*)\b/.test(geoBody) && !/<\s*6\b/.test(geoBody),
  'G10c GeodesicTileGraph: no trig, no "< 6" neighbour rule');
const callers = [];
const walk = (dir) => { for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
  const rel = dir + '/' + e.name;
  if (e.isDirectory()) { if (!/testing/.test(rel)) walk(rel); } else if (/\.js$/.test(e.name) && /generateGeoGrid|GeoColonyGridGenerator/.test(stripComments(src(rel)))) callers.push(rel);
} };
walk('src');
const allowed = ['src/map/GeoColonyGridGenerator.js', 'src/map/ColonyGridFactory.js', 'src/debug/GeoGridDebug.js'];
assert(callers.length >= 2 && callers.every(c => allowed.includes(c)), `G10d geo generator referenced only by the generator, the factory and the debug helper in CS-5a (${callers.join(', ')})`);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
