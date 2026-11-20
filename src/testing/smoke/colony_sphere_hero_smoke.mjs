// ARC COLONY SPHERE CS-7 część A — keeper bohatera kuli kolonii (ColonySphereLogic + ColonySphereRenderer +
// ColonySphereOverlayShader + ColonySphereOverlayLogic). Plan §3.15.
//
//   H1  picking: komórki nakładki = komórki Voronoja środków pól (narożnik równoodległy od 3 środków, żaden bliżej);
//       losowe punkty kuli → pole z rysunku (test wielokąta) = pole o najbliższym środku; punkty tuż po obu stronach
//       krawędzi → pole i sąsiad; ekran → promień → pole = rzut pola na ekran (w obie strony); poza tarczą −1
//   H2  kamera: baza ortonormalna, tarcza w kadrze = fitFraction, zakres zoomu, kółko w klamrach, przeciągnięcie
//       „za ręką" (punkt pod kursorem jedzie o tyle pikseli, ile mysz)
//   H3  automat auto-obrotu (decyzja 3): kursor na kuli zatrzymuje, zjazd → przerwa → rozpędzanie → obrót; brak
//       wznowienia przy zaznaczonym polu / trybie budowy; przeciąganie trzyma
//   H4  automat mapy: LOD natychmiast → przenikanie → bohater; bohater w cache → bez etapu LOD
//   H5  WYKONANIEM na prawdziwym three r171 z atrapą GL: render na żądanie (bezczynność 0 renderów, auto-obrót ≈ 30 /s,
//       pogoda ≈ 10 /s, przeciąganie co klatkę), stany podmiany mapy, rozrzedzony pokład Wenus, utrata kontekstu →
//       fallback 2D → powrót, brak kontekstu / wyjątek renderu → fallback 2D, picking działa w fallbacku
//   H6  nakładka (decyzje 4 i 6): pakowanie tekstury pól, maska krawędzi granicznych, zwykły widok / tryb budowy /
//       soczewki / zaopatrzenie, cykl klawisza soczewki
//   H7  światło (decyzja 5): barwa słońca jak mapa układu, dopełnienie nocy, stolica w dzień w widoku startowym,
//       ciało związane pływowo = stały punkt podgwiezdny; stałe światła = ThreeRenderer (pin źródła)
//   H8  piny źródła: ten sam shader co mapa układu, GLSL bez interpolacji i odwrotnych apostrofów, moduły shaderów bez
//       importu three, brak Math.random, nakładka bez testu głębi
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-7) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const L = (await tryImport('../../renderer/ColonySphereLogic.js')) ?? {};
const RMOD = await tryImport('../../renderer/ColonySphereRenderer.js');
const OVS = await tryImport('../../renderer/ColonySphereOverlayShader.js');
const OL = (await tryImport('../../ui/ColonySphereOverlayLogic.js')) ?? {};
const { geodesicTopology } = await import('../../map/GeodesicTopology.js');
const { surfaceSunColor } = await import('../../renderer/SurfaceShader.js');
const { generateGeoGrid } = await import('../../map/GeoColonyGridGenerator.js');
const { TERRAIN_TYPES } = await import('../../map/HexTile.js');
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const T = L.SPHERE_TUNING ?? {};
const NS = [3, 4, 5, 6];

// Deterministyczny generator (mulberry32) — żadnego Math.random w keeperze.
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randDir(r) { const z = r() * 2 - 1, a = r() * 2 * Math.PI, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const centre = (topo, i) => [topo.cx[i], topo.cy[i], topo.cz[i]];
// Niezależny wzorzec: pole o najmniejszym kącie do punktu (acos), nie funkcja pod testem.
function refNearest(topo, p) { let b = -1, bd = Infinity; for (let i = 0; i < topo.count; i++) { const a = Math.acos(Math.max(-1, Math.min(1, dot(centre(topo, i), p)))); if (a < bd) { bd = a; b = i; } } return b; }
// Punkt w wielokącie sferycznym pola (narożniki przeciwnie do zegara): po wewnętrznej stronie każdej krawędzi.
function inCell(corners, p) { for (let k = 0; k < corners.length; k++) { const a = corners[k], b = corners[(k + 1) % corners.length]; if (dot(cross(a, b), p) < -1e-9) return false; } return true; }

// ── H1 picking ──────────────────────────────────────────────────────────────────────
console.log('\nH1 picking');
if (!L.buildTileMesh) { for (const n of ['H1a', 'H1b', 'H1c', 'H1d', 'H1e', 'H1f']) assert(false, `${n} ColonySphereLogic missing`); } else {
  let cornersChecked = 0, cornerBad = 0, cornerCountBad = 0, trisBad = 0;
  for (const n of NS) {
    const topo = geodesicTopology(n), mesh = L.buildTileMesh(topo);
    if (mesh.tris !== 6 * topo.count - 12) trisBad++;
    for (let i = 0; i < topo.count; i++) {
      const cs = L.tileCorners(topo, i);
      if (cs.length !== topo.neighbors(i).length) cornerCountBad++;
      const nb = topo.neighbors(i);
      cs.forEach((c, j) => {
        cornersChecked++;
        const di = dot(centre(topo, i), c), da = dot(centre(topo, nb[j]), c), db = dot(centre(topo, nb[(j + 1) % nb.length]), c);
        let mx = -2; for (let k = 0; k < topo.count; k++) mx = Math.max(mx, dot(centre(topo, k), c));
        if (Math.abs(di - da) > 1e-6 || Math.abs(di - db) > 1e-6 || mx - di > 1e-6) cornerBad++;
      });
    }
  }
  assert(cornersChecked > 5000 && cornerBad === 0, `H1a every cell corner is equidistant from its 3 tile centres and no centre is closer — Voronoi cells (${cornersChecked} corners, ${cornerBad} bad)`);
  assert(cornerCountBad === 0 && trisBad === 0, 'H1b cell has one corner per neighbour (5 / 6); mesh = 6·count − 12 fan triangles');
  // siatka rysunku: trójkąt wachlarza j pola = (środek, narożnik j−1, narożnik j), krawędź j (slot) wspólna z sąsiadem j
  let fanBad = 0, fans = 0;
  for (const n of NS) {
    const topo = geodesicTopology(n), mesh = L.buildTileMesh(topo);
    let v = 0;
    for (let i = 0; i < topo.count; i++) {
      const cs = L.tileCorners(topo, i), k = cs.length;
      for (let j = 0; j < k; j++, v += 3) {
        fans++;
        const P = (o) => [mesh.position[(v + o) * 3], mesh.position[(v + o) * 3 + 1], mesh.position[(v + o) * 3 + 2]];
        const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6;
        if (!near(P(0), centre(topo, i)) || !near(P(1), cs[(j + k - 1) % k]) || !near(P(2), cs[j]) || mesh.tile[v] !== i || mesh.tile[v + 2] !== i
          || mesh.slot[v] !== j || mesh.edge[v] !== 0 || mesh.edge[v + 1] !== 1 || mesh.edge[v + 2] !== 1) fanBad++;
      }
    }
  }
  assert(fans > 5000 && fanBad === 0, `H1b2 drawn mesh: fan triangle j = (tile centre, corner j−1, corner j) with tile id, edge slot j and the edge coordinate 0 / 1 / 1 (${fans} triangles)`);

  let samples = 0, polyMiss = 0, refMiss = 0;
  for (const n of NS) {
    const topo = geodesicTopology(n), r = prng(0xC57A + n);
    for (let s = 0; s < 2500; s++) {
      const p = randDir(r), t = L.nearestTile(topo, p[0], p[1], p[2]);
      samples++;
      if (t !== refNearest(topo, p)) refMiss++;
      if (!inCell(L.tileCorners(topo, t), p)) polyMiss++;
    }
  }
  assert(samples === 10000 && refMiss === 0, `H1c sampled sphere points → tile of the nearest centre (independent angular reference; ${samples} points, ${refMiss} miss)`);
  assert(polyMiss === 0, `H1c2 the picked tile's DRAWN cell contains the point (picture = picking; ${polyMiss} miss)`);

  let edges = 0, edgeBad = 0;
  for (const n of NS) {
    const topo = geodesicTopology(n);
    for (let i = 0; i < topo.count; i++) {
      const cs = L.tileCorners(topo, i), nb = topo.neighbors(i), k = cs.length;
      for (let j = 0; j < k; j++) {
        // krawędź j (narożniki j−1, j) jest wspólna z sąsiadem j: środek krawędzi przesunięty o 1e-4 w obie strony
        const a = cs[(j + k - 1) % k], b = cs[j], mid = norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
        const ci = centre(topo, i), cn = centre(topo, nb[j]);
        const inP = norm([mid[0] + (ci[0] - cn[0]) * 1e-4, mid[1] + (ci[1] - cn[1]) * 1e-4, mid[2] + (ci[2] - cn[2]) * 1e-4]);
        const outP = norm([mid[0] - (ci[0] - cn[0]) * 1e-4, mid[1] - (ci[1] - cn[1]) * 1e-4, mid[2] - (ci[2] - cn[2]) * 1e-4]);
        edges++;
        if (L.nearestTile(topo, ...inP) !== i || L.nearestTile(topo, ...outP) !== nb[j]) edgeBad++;
      }
    }
  }
  assert(edges > 5000 && edgeBad === 0, `H1d points just inside / outside every cell edge pick the tile / the neighbour sharing THAT edge slot (${edges} edges, ${edgeBad} bad)`);

  const topo5 = geodesicTopology(5);
  const view = { lon: 0.7, lat: 0.3, dist: 3.1 };
  let seen = 0, rtBad = 0;
  for (let i = 0; i < topo5.count; i++) {
    const p = L.projectDir(view, 1.4, topo5.cx[i], topo5.cy[i], topo5.cz[i]);
    if (!p.front) continue;
    seen++;
    if (L.pickTile(topo5, view, 1.4, p.nx, p.ny) !== i) rtBad++;
  }
  assert(seen > 40 && seen < topo5.count && rtBad === 0, `H1e tile centre → screen → ray → the same tile (${seen} visible tiles, hidden side excluded)`);
  assert(L.pickTile(topo5, view, 1.4, 0.98, 0.98) === -1 && L.pickTile(topo5, view, 1.4, 0, 0) >= 0, 'H1f outside the disc → −1; disc centre → a tile');
}

// ── H2 kamera ───────────────────────────────────────────────────────────────────────
console.log('\nH2 camera');
if (!L.cameraBasis) { for (const n of ['H2a', 'H2b', 'H2c', 'H2d']) assert(false, `${n} ColonySphereLogic missing`); } else {
  const b = L.cameraBasis({ lon: 1.1, lat: -0.6, dist: 3 });
  const ortho = Math.abs(dot(b.fwd, b.right)) < 1e-12 && Math.abs(dot(b.fwd, b.up)) < 1e-12 && Math.abs(dot(b.right, b.up)) < 1e-12
    && Math.abs(Math.hypot(...b.up) - 1) < 1e-12 && Math.abs(Math.hypot(...b.pos) - 3) < 1e-12 && b.up[1] > 0;
  assert(ortho, 'H2a camera basis orthonormal, up toward +Y, position at the view distance');
  let fitBad = 0;
  for (const aspect of [0.7, 1, 1.4, 2.2]) {
    const d = L.fitDistance(aspect);
    const want = T.fitFraction * Math.min(1, aspect);
    if (Math.abs(L.discRadiusNdc({ dist: d }) - want) > 1e-9) fitBad++;
  }
  assert(fitBad === 0, 'H2b full zoom-out: disc radius = fitFraction of the shorter frame side (4 aspect ratios)');
  let zoomBad = 0;
  for (const n of NS) {
    const rg = L.zoomRange(geodesicTopology(n).count, 1.4);
    if (!(rg.near < rg.far && rg.near >= T.zoomNearMin - 1e-9 && rg.near <= T.zoomNearMax + 1e-9)) zoomBad++;
    if (L.applyWheel(rg.far, 5000, rg) !== rg.far || L.applyWheel(rg.far, -99999, rg) !== rg.near) zoomBad++;
    const mid = L.applyWheel(rg.far, -200, rg);
    if (!(mid < rg.far && mid > rg.near)) zoomBad++;
  }
  const r3 = L.zoomRange(92, 1.4), r6 = L.zoomRange(362, 1.4);
  assert(zoomBad === 0 && r6.near < r3.near, 'H2c zoom range per grid: near < far, wheel clamps at both ends, finer grids zoom closer');
  // przeciągnięcie: punkt pod środkiem kadru po przeciągnięciu o (dx, dy) px ląduje ≈ (dx, dy) px od środka
  const v0 = { lon: 0.4, lat: 0.2, dist: 3.4 }, Hpx = 800, aspect = 1.4;
  const under = L.pickDir(v0, aspect, 0, 0);
  const v1 = { ...v0, ...L.applyDrag(v0, 60, 40, Hpx) };
  const pr = L.projectDir(v1, aspect, under[0], under[1], under[2]);
  const px = pr.nx * (Hpx * aspect) / 2, py = -pr.ny * Hpx / 2;
  assert(Math.abs(px - 60) < 3 && Math.abs(py - 40) < 3 && v1.lon > v0.lon && v1.lat > v0.lat, `H2d drag follows the hand: the grabbed point moves (${px.toFixed(1)}, ${py.toFixed(1)}) px for a (60, 40) px drag`);
  assert(L.clampLat(9) === T.pitchMaxDeg * Math.PI / 180 && Math.abs(L.shortestLonDelta(3.0, -3.0) - (2 * Math.PI - 6)) < 1e-12, 'H2e latitude clamp and shortest longitude arc across ±π');
}

// ── H3 automat auto-obrotu ──────────────────────────────────────────────────────────────────
console.log('\nH3 auto-rotation state machine');
if (!L.stepSpin) { for (const n of ['H3a', 'H3b', 'H3c', 'H3d', 'H3e']) assert(false, `${n} ColonySphereLogic missing`); } else {
  const free = (now) => ({ now, hover: false, dragging: false, locked: false });
  let s = L.createSpin(0);
  assert(s.mode === 'spin' && s.factor === 1 && L.stepSpin(s, free(5000)).factor === 1, 'H3a starts spinning and keeps spinning while nothing touches it');
  s = L.stepSpin(s, { ...free(1000), hover: true });
  assert(s.mode === 'hold' && s.factor === 0, 'H3b hovering the sphere stops it');
  s = L.stepSpin(s, free(2000));
  const w1 = L.stepSpin(s, free(2000 + T.resumeDelayMs - 1));
  assert(s.mode === 'wait' && w1.mode === 'wait' && w1.factor === 0, 'H3c after the mouse leaves: waits the resume delay without rotating');
  let e = L.stepSpin(w1, free(2000 + T.resumeDelayMs));
  const t0 = 2000 + T.resumeDelayMs;
  const f1 = L.stepSpin(e, free(t0 + T.easeInMs * 0.25)).factor, f2 = L.stepSpin(e, free(t0 + T.easeInMs * 0.5)).factor, f3 = L.stepSpin(e, free(t0 + T.easeInMs * 0.75)).factor;
  const done = L.stepSpin(e, free(t0 + T.easeInMs));
  assert(e.mode === 'ease' && e.factor === 0 && f1 > 0 && f1 < f2 && f2 < f3 && f3 < 1 && f2 < 0.5 && done.mode === 'spin' && done.factor === 1,
    `H3d then eases in (factor ${f1.toFixed(3)} < ${f2.toFixed(3)} < ${f3.toFixed(3)}, slow start) up to full speed`);
  // blokada: zaznaczone pole / tryb budowy — bez wznowienia, choćby kursor dawno zjechał
  let k = L.stepSpin(L.createSpin(0), { now: 100, hover: false, dragging: false, locked: true });
  let resumed = false;
  for (let t = 200; t <= 60000; t += 100) { k = L.stepSpin(k, { now: t, hover: false, dragging: false, locked: true }); if (k.factor > 0 || k.mode !== 'hold') resumed = true; }
  const afterUnlock = L.stepSpin(k, free(60100));
  assert(!resumed && afterUnlock.mode === 'wait' && afterUnlock.factor === 0, 'H3e no auto-rotation for 60 s while a tile is selected / build mode is on; unlocking starts the resume delay');
  const dr = L.stepSpin(L.createSpin(0), { now: 10, hover: false, dragging: true, locked: false });
  const reHover = L.stepSpin(L.stepSpin(dr, free(20)), { ...free(30), hover: true });
  assert(dr.mode === 'hold' && reHover.mode === 'hold', 'H3f dragging holds the rotation; re-entering during the delay cancels the resume');
}

// ── H4 automat mapy ─────────────────────────────────────────────────────────────────────
console.log('\nH4 surface map swap');
if (!L.mapSwapStep) { for (const n of ['H4a', 'H4b', 'H4c']) assert(false, `${n} ColonySphereLogic missing`); } else {
  const st = (p, has) => L.mapSwapStep(p, { lod: false, hero: false, crossDone: false, ...has });
  const a = st('none', {}), b = st('none', { lod: true }), c = st('lod', { lod: true }), d = st('lod', { lod: true, hero: true });
  const e = st('cross', { hero: true }), f = st('cross', { hero: true, crossDone: true }), g = st('hero', { lod: true, hero: true });
  assert(a.action === null && b.phase === 'lod' && b.action === 'show-lod' && c.action === null && d.phase === 'cross' && d.action === 'cross-to-hero'
    && e.action === null && f.phase === 'hero' && f.action === 'finish-cross' && g.action === null && g.phase === 'hero',
  'H4a LOD first → crossfade when the hero map arrives → hero; no action without a new map');
  const direct = st('none', { lod: true, hero: true });
  assert(direct.phase === 'hero' && direct.action === 'show-hero', 'H4b hero map already cached → shown directly (no LOD stage)');
  assert(L.crossProgress(1000, 1000, 400) === 0 && L.crossProgress(1000, 1200, 400) === 0.5 && L.crossProgress(1000, 9000, 400) === 1 && L.crossProgress(null, 5, 400) === 1,
    'H4c crossfade progress 0 → 1 over the fade time');
}

// ── H5 renderer wykonaniem (prawdziwe three, atrapa GL) ──────────────────────────────────────────────
console.log('\nH5 renderer by execution');
const body = (arch, extra = {}) => ({ id: 'b_' + arch, type: 'planet', bodyArchetype: arch, surfaceSeed: 0xC57A, systemId: 'sys_home', atmosphere: 'breathable', waterCoverage: arch === 'terran' ? 0.6 : null, ...extra });
function fakeCanvas() {
  const ls = {};
  return { width: 2, height: 2, addEventListener: (k, f) => { ls[k] = f; }, removeEventListener: (k) => { delete ls[k]; }, fire: (k) => ls[k]?.({ preventDefault() {} }) };
}
function fakeCtx() {
  const calls = { drawImage: 0, fill: 0, stroke: 0 };
  const ctx = new Proxy({}, { get: (_, k) => (k === 'getTransform' ? () => ({ a: 1.25 }) : (k === 'calls' ? calls : (...a) => { if (k in calls) calls[k]++; })), set: () => true });
  return ctx;
}
function fakeCache(has) {
  const map = (w, h) => ({ data: new Uint8Array(w * h * 4), w, h });
  const maps = { body: map(256, 128), hero: map(1024, 512) };
  return { get: (b, lod = 'body') => (has[lod === 'hero' ? 'hero' : 'lod'] ? maps[lod === 'hero' ? 'hero' : 'body'] : null),
    request: () => new Promise(() => {}), requests: 0 };
}
function mk(arch, { has = { lod: true, hero: true }, weather = 0, gl = 'ok', extra = {} } = {}) {
  const env = { now: 0, renders: 0, canvas: null, sizes: [], changes: 0 };
  const cache = fakeCache(has);
  const r = new RMOD.ColonySphereRenderer({
    THREE, now: () => env.now, getCache: () => cache, getWeatherRate: () => env.weather ?? weather, onChange: () => { env.changes++; },
    createCanvas: () => (env.canvas = fakeCanvas()),
    createGL: () => { if (gl === 'none') throw new Error('no_webgl'); return { render: () => { if (env.throwRender) throw new Error('lost'); env.renders++; }, setSize: (w, h) => env.sizes.push([w, h]), dispose() {}, forceContextLoss() {}, getContext: () => null }; },
  });
  const n = 4;
  const ok = r.setBody({ body: body(arch, extra), n, star: { colorHex: 0xfff1de, spectralType: 'G', luminosity: 1 }, capitalTile: 30 });
  return { r, env, cache, has, ok, ctx: fakeCtx(), rect: { x: 100, y: 60, w: 880, h: 640 } };
}
const run = (m, frames, each) => { for (let i = 0; i < frames; i++) { m.env.now += 1000 / 60; each?.(i); m.last = m.r.draw(m.ctx, m.rect, { now: m.env.now }); } };

if (!RMOD?.ColonySphereRenderer) { for (const n of ['H5a', 'H5b', 'H5c', 'H5d', 'H5e', 'H5f', 'H5g', 'H5h', 'H5i', 'H5j']) assert(false, `${n} ColonySphereRenderer missing`); } else {
  // bezczynność: ciało bez atmosfery, zaznaczone pole (blokada obrotu)
  const idle = mk('barren', { extra: { atmosphere: 'none' } });
  idle.r.setMode({ selectedTile: 30, lock: true });
  run(idle, 90);
  const r0 = idle.env.renders, c0 = idle.ctx.calls.drawImage;
  run(idle, 300);
  assert(idle.ok && idle.r.info().mode === 'gl' && r0 > 0 && idle.env.renders === r0 && idle.ctx.calls.drawImage === c0 + 300 && idle.last.animating === false,
    `H5a idle (airless body, tile selected): 0 renders in 300 frames, every frame only composites the last image (${idle.env.renders - r0} renders)`);
  assert(idle.env.sizes.length === 1 && idle.env.sizes[0][0] === 1100 && idle.env.sizes[0][1] === 800, 'H5a2 GL canvas sized once to the frame in device pixels (UI scale 1.25)');

  const spin = mk('barren', { extra: { atmosphere: 'none' } });
  run(spin, 90);
  const lon0 = spin.r.view.lon, s0 = spin.env.renders;
  run(spin, 120);   // 2 s
  const spinRenders = spin.env.renders - s0, dLon = spin.r.view.lon - lon0;
  assert(spin.r.info().spin === 'spin' && spinRenders >= 58 && spinRenders <= 62 && Math.abs(dLon - T.spinRate * 2) < 1e-6,
    `H5b auto-rotation: ${spinRenders} renders in 2 s (≈ ${T.fpsSpin} fps, not 60) while the view turns ${dLon.toFixed(4)} rad = spinRate × 2 s`);

  const wx = mk('terran', { weather: 1 });
  wx.r.setMode({ selectedTile: 30, lock: true });
  run(wx, 90);
  const w0 = wx.env.renders;
  run(wx, 120);
  const wr = wx.env.renders - w0;
  wx.env.weather = 0;   // pauza gry: zegar pogody stoi
  run(wx, 5); const w1 = wx.env.renders; run(wx, 120);
  assert(wr >= 19 && wr <= 21 && wx.env.renders === w1, `H5c weather only (clouds drift, no rotation): ${wr} renders in 2 s (≈ ${T.fpsWeather} fps); game paused → 0`);

  const drag = mk('barren', { extra: { atmosphere: 'none' } });
  run(drag, 90);
  const d0 = drag.env.renders, dl0 = drag.r.view.lon;
  const started = drag.r.dragStart(540, 380, drag.rect);
  run(drag, 60, (i) => drag.r.pointerMove(540 + 6 + i * 2, 380, drag.rect));
  const moved = drag.r.dragEnd();
  assert(started && moved && drag.env.renders - d0 === 60 && drag.r.view.lon > dl0 && drag.r.info().spin === 'hold',
    'H5d dragging renders every frame, turns the sphere and holds auto-rotation');
  assert(drag.r.dragStart(105, 65, drag.rect) === false, 'H5d2 a drag cannot start outside the disc');

  // mapa: tylko LOD → przenikanie po nadejściu bohatera → bohater
  const sw = mk('terran', { has: { lod: true, hero: false } });
  run(sw, 60);
  const pLod = sw.r.mapPhase, matLod = sw.r._obj.surface.material, mixLod = matLod.uniforms.uMapMix.value, sizeLod = matLod.uniforms.uMapSize.value.slice();
  sw.has.hero = true;
  run(sw, 2);
  const pCross = sw.r.mapPhase, crossMesh = sw.r._obj.cross;
  const alphaEarly = crossMesh?.material.blendAlpha, blendAtCross = crossMesh?.material.blending, srcAtCross = crossMesh?.material.blendSrc;
  run(sw, Math.ceil(T.crossFadeMs / (1000 / 60) / 2));
  const alphaMid = sw.r._obj.cross?.material.blendAlpha;
  run(sw, 60);
  const matHero = sw.r._obj.surface.material;
  assert(pLod === 'lod' && mixLod === 1 && sizeLod[0] === 256 && pCross === 'cross' && !!crossMesh && blendAtCross === THREE.CustomBlending
    && srcAtCross === THREE.ConstantAlphaFactor && alphaEarly < alphaMid && alphaMid < 1,
  `H5e LOD shown first (256 px map, fully faded in); hero arrival starts a constant-alpha crossfade (alpha ${Number(alphaEarly).toFixed(2)} → ${Number(alphaMid).toFixed(2)})`);
  assert(sw.r.mapPhase === 'hero' && sw.r._obj.cross === null && matHero !== matLod && matHero.uniforms.uMapSize.value[0] === 1024 && matHero.transparent === false
    && matHero.depthWrite === true && matHero.blending === THREE.NormalBlending && matHero.fragmentShader === matLod.fragmentShader,
  'H5f after the crossfade the hero material (1024 px map, same program) is the only surface, opaque again');
  const direct = mk('terran');
  run(direct, 30);
  assert(direct.r.mapPhase === 'hero' && direct.r._obj.surface.material.uniforms.uMapSize.value[0] === 1024, 'H5g hero map already in the cache → hero phase without a LOD stage');

  const venus = mk('hothouse', { extra: { atmosphere: 'dense' } }), titan = mk('cryo_haze', { extra: { atmosphere: 'dense' } }), earth = mk('terran');
  run(venus, 3); run(titan, 3); run(earth, 3);
  const hv = venus.r.info().haze, ht = titan.r.info().haze, he = earth.r.info().haze;
  const archHaze = venus.r._airLook.hazeOpacity, earthHaze = earth.r._airLook.hazeOpacity;
  assert(archHaze > 0.9 && hv === T.hazeMax && ht === T.hazeMax && he === Math.min(earthHaze, T.hazeMax),
    `H5h Venus / Titan decks thinned in the colony view (archetype ${archHaze} → ${hv}); thin veils keep their value (terran ${he})`);

  // utrata kontekstu → fallback 2D → powrót
  const lost = mk('barren', { extra: { atmosphere: 'none' } });
  run(lost, 10);
  lost.env.canvas.fire('webglcontextlost');
  const f0 = lost.ctx.calls.fill;
  run(lost, 3);
  const inFallback = lost.r.info().mode === '2d' && lost.r.info().fallbackReason === 'context_lost' && lost.last.fallback === true && lost.ctx.calls.fill > f0;
  const pickLost = lost.r.pick(lost.r.project(30, lost.rect).x, lost.r.project(30, lost.rect).y, lost.rect);
  lost.env.canvas.fire('webglcontextrestored');
  const rr = lost.env.renders;
  run(lost, 3);
  assert(inFallback && pickLost === 30 && lost.r.info().mode === 'gl' && lost.env.renders > rr, 'H5i WebGL context lost → 2D fallback drawn (picking still works) → restored → renders again');

  const none = mk('terran', { gl: 'none' });
  none.r.setMode({ lock: true });   // bez auto-obrotu: stolica zostaje pod kamerą
  let threw = false;
  try { run(none, 5); } catch (e) { threw = true; }
  const pc = none.r.project(30, none.rect);
  const boom = mk('terran');
  run(boom, 5); boom.env.throwRender = true;
  let threw2 = false;
  try { boom.r.setMode({ selectedTile: 4 }); run(boom, 5); } catch (e) { threw2 = true; }
  assert(!threw && none.r.info().mode === '2d' && none.r.info().fallbackReason === 'context_failed' && none.ctx.calls.fill > 100 && none.r.pick(pc.x, pc.y, none.rect) === 30
    && Math.abs(pc.x - (none.rect.x + none.rect.w / 2)) < 1e-6,
  'H5j no WebGL → 2D fallback: tiles drawn as polygons, capital centred, picking works, nothing thrown');
  assert(!threw2 && boom.r.info().mode === '2d' && boom.last.fallback === true, 'H5k a render exception switches to the 2D fallback instead of throwing into the UI loop');

  const gas = new RMOD.ColonySphereRenderer({ THREE, now: () => 0, getCache: () => null, createGL: () => ({}), createCanvas: fakeCanvas });
  const gasOk = gas.setBody({ body: { id: 'g', type: 'planet', bodyArchetype: 'gas_giant', surfaceSeed: 5 }, n: 3 });
  assert(gasOk === false && gas.fallback().reason === 'no_look', 'H5l a body without a shared-shader look falls back to 2D (no GL scene built)');

  // dwuklik: obrót do pola; widok startowy nad stolicą
  const turn = mk('barren', { extra: { atmosphere: 'none' } });
  turn.r.setMode({ selectedTile: 30, lock: true });
  run(turn, 5);
  const startCentre = turn.r.project(30, turn.rect);
  const ch0 = turn.env.changes;
  turn.r.turnTo(77);
  const chTurn = turn.env.changes - ch0;
  run(turn, Math.ceil(T.turnMs / (1000 / 60)) + 5);
  const after = turn.r.project(77, turn.rect);
  const topo4 = geodesicTopology(4);
  const latOk = Math.abs(Math.asin(topo4.cy[77])) <= T.pitchMaxDeg * Math.PI / 180;
  assert(Math.hypot(startCentre.x - 540, startCentre.y - 380) < 1e-6 && latOk && Math.hypot(after.x - 540, after.y - 380) < 1e-3 && after.visible,
    'H5m initial view centred on the capital; double-click turn brings the chosen tile under the camera');
  const ch1 = turn.env.changes; turn.r.rotateBy(0.1, 0); turn.r.rotateBy(-0.1, 0); const chKey = turn.env.changes - ch1;
  const far = turn.r.view.dist; const ch2 = turn.env.changes; turn.r.wheel(-400); const chWheel = turn.env.changes - ch2; run(turn, 90);
  assert(chTurn === 1 && chKey === 2 && chWheel === 1, 'H5o a view change made outside the draw (turn to tile, key rotation, wheel) asks the host for a frame — the UI canvas draws on demand');
  assert(turn.r.view.dist < far && turn.r.view.dist >= turn.r.info().range.near - 1e-9 && Math.abs(turn.r.view.dist - turn.r._distTarget) < 1e-9, 'H5n wheel zooms in smoothly to the target inside the range');
}

// ── H6 nakładka ───────────────────────────────────────────────────────────────────────
console.log('\nH6 tile overlay');
if (!OL.composeSphereOverlay || !L.writeOverlayTile) { for (const n of ['H6a', 'H6b', 'H6c', 'H6d', 'H6e', 'H6f', 'H6g']) assert(false, `${n} overlay logic missing`); } else {
  const topo = geodesicTopology(4), n = topo.count;
  const d0 = L.createOverlayData(n);
  L.writeOverlayTile(d0, n, 7, { fill: [1, 2, 3, 4], line: [5, 6, 7, 8], lineWidth: 2.5, borderMask: 0b101001, hatch: true, foreign: true });
  const row = (r, i) => Array.from(d0.slice((r * n + i) * 4, (r * n + i) * 4 + 4));
  assert(d0.length === n * 3 * 4 && row(0, 7).join() === '1,2,3,4' && row(1, 7).join() === '5,6,7,8' && row(2, 7).join() === '41,40,255,255' && row(0, 8).join() === '0,0,0,0',
    'H6a tile texture packing: fill row, outline row, meta row (edge mask, width × 16, hatch, foreign)');

  const body4 = body('terran');
  const grid = generateGeoGrid(body4, true);
  const gt = geodesicTopology(grid.n), tiles = grid.tiles;
  for (const t of tiles) t.owner = 'player';
  const land = tiles.map((t, i) => i).filter(i => TERRAIN_TYPES[tiles[i].type]?.buildable);
  const sea = tiles.map((t, i) => i).filter(i => !TERRAIN_TYPES[tiles[i].type]?.buildable);
  const cap = land[0], mine = land[1], site = land[2], free = land[3];
  tiles[cap].capitalBase = true; tiles[mine].buildingId = 'mine'; tiles[site].underConstruction = { buildingId: 'farm', progress: 0.2 };
  const N = gt.count;
  const fillA = (d, i) => d[i * 4 + 3], lineA = (d, i) => d[(N + i) * 4 + 3], meta = (d, i) => Array.from(d.slice((2 * N + i) * 4, (2 * N + i) * 4 + 4));
  const rgb = (d, i) => Array.from(d.slice(i * 4, i * 4 + 3));

  const plain = OL.composeSphereOverlay({ topo: gt, tiles });
  const marked = [cap, mine, site];
  const others = tiles.map((t, i) => i).filter(i => !marked.includes(i));
  assert(land.length > 10 && sea.length > 10 && marked.every(i => lineA(plain, i) > 0 && fillA(plain, i) > 0) && others.length > 100 && others.every(i => lineA(plain, i) === 0 && fillA(plain, i) === 0),
    `H6b normal view: only own building / capital / construction tiles carry an outline and a tint (${marked.length} marked, ${others.length} clean) — the grid itself is the shader's cursor ring`);
  assert(rgb(plain, mine).join() === OL.categoryBytes('mining').join() && tiles.every((t, i) => meta(plain, i)[0] === 0),
    'H6c building tile tinted by its category colour; one owner everywhere → no border edge');

  const verdict = (t) => (t.buildingId || t.capitalBase || t.underConstruction ? 'occupied' : (TERRAIN_TYPES[t.type]?.buildable ? 'ok' : 'blocked'));
  const build = OL.composeSphereOverlay({ topo: gt, tiles, buildVerdict: verdict });
  const okGreen = OL.SPHERE_OVERLAY_COLORS.ok.join(), red = OL.SPHERE_OVERLAY_COLORS.blocked.join();
  assert(rgb(build, free).join() === okGreen && lineA(build, free) > 200 && meta(build, free)[2] === 0
    && sea.every(i => rgb(build, i).join() === red && meta(build, i)[2] === 255 && fillA(build, i) > 0)
    && meta(build, mine)[2] === 255 && rgb(build, mine).join() === OL.SPHERE_OVERLAY_COLORS.occupied.join() && tiles.every((t, i) => fillA(build, i) > 0),
  `H6d build mode: every tile marked — allowed green + outline, forbidden red hatch (${sea.length} sea tiles), occupied grey hatch`);

  const terr = OL.composeSphereOverlay({ topo: gt, tiles, lens: 'terrain' });
  assert(tiles.every((t, i) => rgb(terr, i).join() === OL.terrainBytes(t.type).join() && fillA(terr, i) > 0) && lineA(terr, mine) > 0,
    'H6e terrain lens: every tile filled with its terrain colour; building outlines stay');

  // własność: łata obcego właściciela → maska krawędzi po OBU stronach granicy, dokładnie na wspólnych krawędziach
  const patch = gt.within(free, 1);
  for (const i of patch) tiles[i].owner = 'emp_x';
  const own = OL.composeSphereOverlay({ topo: gt, tiles, lens: 'ownership' });
  let borderBad = 0, borderEdges = 0;
  for (let i = 0; i < N; i++) {
    const nb = gt.neighbors(i), m = meta(own, i)[0];
    nb.forEach((j, slot) => { const differs = tiles[i].owner !== tiles[j].owner; if (differs) borderEdges++; if (((m >> slot) & 1) !== (differs ? 1 : 0)) borderBad++; });
  }
  assert(borderEdges > 0 && borderEdges % 2 === 0 && borderBad === 0 && meta(own, free)[3] === 255 && meta(own, cap)[3] === 0
    && rgb(own, free).join() === OL.SPHERE_OVERLAY_COLORS.foreign.join() && rgb(own, cap).join() === OL.SPHERE_OVERLAY_COLORS.own.join(),
  `H6f ownership lens: player / foreign fills; border bits exactly on edges between different owners, both sides (${borderEdges} edge sides)`);

  const supply = new Map([[cap, { type: 'capital' }], [free, { type: 'barracks' }]]);
  const sup = OL.composeSphereOverlay({ topo: gt, tiles, supply, lens: 'terrain' });
  const dep = OL.composeSphereOverlay({ topo: gt, tiles, lens: 'deposits' });
  assert(rgb(sup, cap).join() === OL.SPHERE_OVERLAY_COLORS.supplyCapital.join() && rgb(sup, free).join() === OL.SPHERE_OVERLAY_COLORS.supplyBarracks.join()
    && rgb(sup, sea[0]).join() === OL.terrainBytes(tiles[sea[0]].type).join() && tiles.every((t, i) => fillA(dep, i) > 0),
  'H6g supply coverage overrides the lens on covered tiles only; deposits lens fills every tile');
  const cyc = []; let lens = 'none'; for (let i = 0; i < 5; i++) { lens = OL.nextLens(lens); cyc.push(lens); }
  assert(cyc.join() === 'terrain,deposits,ownership,none,terrain' && OL.fallbackColorsOf(tiles).length === N, 'H6h lens key cycle: terrain → deposits → ownership → off; 2D fallback colours per tile');
}

// ── H7 światło ─────────────────────────────────────────────────────────────────────────
console.log('\nH7 light');
if (!L.sphereLight) { for (const n of ['H7a', 'H7b', 'H7c', 'H7d']) assert(false, `${n} ColonySphereLogic missing`); } else {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const hex = 0xffd27a, c = [lin(0xff / 255), lin(0xd2 / 255), lin(0x7a / 255)];
  const want = surfaceSunColor(c[0], c[1], c[2], 2.8 * Math.pow(0.6, 0.22));
  const got = L.sphereLight({ colorHex: hex, spectralType: 'K', luminosity: 0.6 });
  const g = L.sphereLight({ colorHex: 0xfff1de, spectralType: 'G', luminosity: 1 });
  assert(got.sun.every((v, i) => Math.abs(v - want[i]) < 1e-12), 'H7a sun colour = the system map formula (surfaceSunColor of the star colour, 2.8 × L^0.22)');
  assert(g.ambient.every((v, i) => v >= T.nightFill[i]) && got.ambient[2] - T.nightFill[2] > g.ambient[2] - T.nightFill[2],
    'H7b ambient = system ambient (cooler for K / M stars) + the night-side fill');
  const topo = geodesicTopology(5);
  let dayBad = 0, centreBad = 0;
  for (let i = 0; i < topo.count; i++) {
    const v = L.viewOver(topo.cx[i], topo.cy[i], topo.cz[i], 4);
    const sun = L.sunDirFor(v);
    if (dot(sun, centre(topo, i)) < 0.5) dayBad++;
    if (Math.abs(Math.asin(topo.cy[i])) <= T.pitchMaxDeg * Math.PI / 180) { const p = L.projectDir(v, 1.4, topo.cx[i], topo.cy[i], topo.cz[i]); if (Math.hypot(p.nx, p.ny) > 1e-9) centreBad++; }
  }
  assert(dayBad === 0 && centreBad === 0, 'H7c initial view over ANY capital tile: the capital is centred and on the day side (252 tiles)');
  const v1 = { lon: 0.2, lat: 0, dist: 4 }, v2 = { lon: 2.9, lat: 0, dist: 4 };
  const a1 = dot(L.sunDirFor(v1), L.dirOf(v1.lon, 0)), a2 = dot(L.sunDirFor(v2), L.dirOf(v2.lon, 0));
  const lockedDir = [0, 0, 1];
  assert(Math.abs(a1 - a2) < 1e-12 && a1 > 0.2 && a1 < 0.95 && L.sunDirFor(v2, lockedDir).join() === '0,0,1',
    'H7d the star keeps a fixed offset from the view (terminator always in frame); tidally locked body → fixed sub-stellar light');
  const tr = stripComments(src('src/renderer/ThreeRenderer.js'));
  const SL = L.SPHERE_LIGHT;
  assert(tr.includes(`STAR_LUMINOSITY_EXP = ${SL.lumExp};`) && /_starLightOrigIntensity\s*=\s*2\.8;/.test(tr) && SL.base === 2.8
    && /AMBIENT_BASE_HEX\s*=\s*0x101a26;/.test(tr) && SL.ambientHex === 0x101a26 && /AmbientLight\(AMBIENT_BASE_HEX, 0\.4\)/.test(tr) && SL.ambientIntensity === 0.4
    && /AMBIENT_COOL_COLOR\s*=\s*new THREE\.Color\(0x0a1c4d\)/.test(tr) && SL.ambientCoolHex === 0x0a1c4d && /AMBIENT_COOL_MIX\s*=\s*0\.6;/.test(tr) && SL.ambientCoolMix === 0.6
    && /toneMappingExposure = 1\.12;/.test(tr) && SL.exposure === 1.12 && /_starLightOrigColor\s*=\s*0xfff1de;/.test(tr) && SL.defaultStarHex === 0xfff1de,
  'H7e light constants mirror ThreeRenderer (star light base, luminosity exponent, ambient, cool mix, exposure) — source pin');
}

// ── H8 piny źródła ────────────────────────────────────────────────────────────────────────
console.log('\nH8 source pins');
const rSrc = stripComments(src('src/renderer/ColonySphereRenderer.js'));
const oSrcRaw = src('src/renderer/ColonySphereOverlayShader.js'), oSrc = stripComments(oSrcRaw);
const lSrc = stripComments(src('src/renderer/ColonySphereLogic.js'));
assert(/SurfaceShader\.createSurfaceMaterial\(/.test(rSrc) && /SurfaceAirShader\.createAirMaterials\(/.test(rSrc) && /resolveSurfaceLook\(/.test(rSrc) && /resolveAirLook\(/.test(rSrc)
  && !/new T\.ShaderMaterial|new THREE\.ShaderMaterial/.test(rSrc),
'H8a the hero uses the system map\'s SurfaceShader / SurfaceAirShader factories and looks — no surface shader of its own');
assert(/ACESFilmicToneMapping/.test(rSrc) && /toneMappingExposure = SPHERE_LIGHT\.exposure/.test(rSrc) && /preserveDrawingBuffer: true/.test(rSrc) && /setHazeOpacity\(mats\.shell, colonyHaze\(/.test(rSrc),
  'H8b same tone mapping and exposure as the system map; drawing buffer preserved for composite-only frames; haze thinned through colonyHaze');
// świadek: trzy źródła istnieją i są niepuste (pin wykluczający na pustym zbiorze byłby fałszywie zielony)
assert(rSrc.length > 4000 && lSrc.length > 4000 && oSrc.length > 1500 && !/Math\.random/.test(rSrc) && !/Math\.random/.test(lSrc) && !/Math\.random/.test(oSrc),
  'H8c no Math.random in the hero renderer, its logic or the overlay shader (all three sources present)');
const glsl = OVS ? OVS.OVERLAY_VERT + OVS.OVERLAY_FRAG : '';
assert(!!OVS && !/from\s+['"]three['"]/.test(oSrc) && !/^import /m.test(oSrc) && !glsl.includes('`') && !/\$\{/.test(oSrcRaw.slice(oSrcRaw.indexOf('OVERLAY_VERT'), oSrcRaw.indexOf('createOverlayUniforms')))
  && !/tonemapping_fragment/.test(glsl),
'H8d overlay shader module: no imports (three injected), no backticks / string interpolation inside GLSL, no tone mapping (UI layer)');
assert(/depthTest: false/.test(oSrc) && /side: THREE\.FrontSide/.test(oSrc) && /texelFetch\(uTiles/.test(glsl) && !/^import .*three/m.test(lSrc),
  'H8e overlay drawn without the depth test on front faces (flat cell triangles sag below the sphere), tile state read by tile id; logic module three-free');
if (OVS && L.buildTileMesh) {
  const topo = geodesicTopology(3), mesh = L.buildTileMesh(topo);
  const geo = OVS.createOverlayGeometry(THREE, mesh);
  const tex = OVS.createOverlayTexture(THREE, L.createOverlayData(topo.count), topo.count);
  const mat = OVS.createOverlayMaterial(THREE, tex, 1.0015);
  assert(geo.getAttribute('position').count === mesh.tris * 3 && geo.getAttribute('aTile').count === mesh.tris * 3 && tex.image.width === topo.count && tex.image.height === 3
    && tex.magFilter === THREE.NearestFilter && mat.transparent === true && mat.uniforms.uHover.value === -1,
  'H8f overlay geometry / texture / material build on real three (3 verts per fan triangle, count × 3 texels, nearest filter)');
} else assert(false, 'H8f overlay shader module missing');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
