// ARC COLONY SPHERE CS-10b — keeper dopracowania jednostek na kuli kolonii (plan §3.20).
//
//   L  pochylenie ku kamerze: funkcja mieszania (środek tarczy, limb, druga strona, k = 0, nad płaszczyzną styczną), macierz
//      instancji z osią pochyloną (podstawa na polu, zwrot zachowany, bez osi = CS-10 bit w bit), „góra” ekranu = baza kamery,
//      renderer podaje widok warstwie modeli, HUD liczy głowę z tej samej osi
//   P  trasa rozkazu ruchu: pola A* (bieżące + kroki), łamana po wielkich kołach (wierzchołki = środki pól), przycięcie pierwszego
//      łuku, grot, krycie (marsz / wygaszanie), widok WYKONANIEM (trasa w marszu, gaśnie po dojściu, klatki; trasy wroga nie ma)
//   S  zaznaczenie: reguła klik / Ctrl / Shift / armia / odznacz, trafienie prostokątem, widok WYKONANIEM (prostokąty modeli,
//      znaczników stosu, znacznika bitwy), `ColonyOverlay._sphereClick` WYKONANIEM (dokładanie / zdejmowanie / stos / wróg)
//   B  okno bitwy: model stron, położenie (góra bohatera, obok inspektora), otwarcie z kuli, rysunek WYKONANIEM (strefy, koniec
//      bitwy zamyka), strefy w `_onHit`, i18n EN / PL
//   F  mapa płaska i flaga OFF: ścieżka 2D nietknięta, `_sphereClick` tylko dla siatki kuli, pomocniki, czysta logika
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-10b) piny degradują do FAIL, nie przerywają.

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
const missing = (names, what) => { for (const n of names) assert(false, `${n} ${what} missing`); };
const body = (s, head) => { const i = s.indexOf(head); if (i < 0) return ''; let d = 0; for (let j = s.indexOf('{', i + head.length - 1); j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) return s.slice(i, j + 1); } return ''; };

const PL = (await tryImport('../../renderer/ColonyUnitPolishLogic.js')) ?? {};
const UL = (await tryImport('../../renderer/ColonyUnitLogic.js')) ?? {};
const SL = (await tryImport('../../renderer/ColonySphereLogic.js')) ?? {};
const UV = (await tryImport('../../ui/ColonySphereUnits.js')) ?? {};
const BW = (await tryImport('../../ui/ColonyBattleWindow.js')) ?? {};
const RMOD = await tryImport('../../renderer/ColonySphereRenderer.js');
const { generateGeoGrid } = await import('../../map/GeoColonyGridGenerator.js');
const { geodesicTopology } = await import('../../map/GeodesicTopology.js');
const { tileGraphOf } = await import('../../map/TileGraph.js');
const { UNIT_ARCHETYPES } = await import('../../data/unitArchetypes.js');
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const vnear = (a, b, e = 1e-9) => near(a[0], b[0], e) && near(a[1], b[1], e) && near(a[2], b[2], e);
const terranBody = () => ({ id: 'p_terran', type: 'planet', bodyArchetype: 'terran', surfaceSeed: 0xC57B, systemId: 'sys_home', atmosphere: 'breathable',
  waterCoverage: 0.6, temperatureC: 15, surface: { hasWater: true }, name: 'Terra', deposits: [] });
const grid = generateGeoGrid(terranBody(), true);
const topo = geodesicTopology(grid.n);
const C = (i) => [topo.cx[i], topo.cy[i], topo.cz[i]];
const A = Array.from({ length: topo.count }, (_, i) => i).find(i => i >= 40 && Math.abs(topo.cy[i]) < 0.6);
let uid = 0;
const unit = (q, extra = {}) => ({ id: `u${++uid}`, q, r: -1, planetId: 'p_terran', owner: 'player', status: 'idle', archetypeId: 'shock_infantry', factionId: 'humanity',
  sprite: 'assets/units/ground/humanity/human_marines.png', hp: 10, hpMax: 10, _animT: 0, _path: [], ...extra });
const foe = (q, extra = {}) => unit(q, { owner: 'emp_001', factionId: 'emp_001', ...extra });
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const randDir = () => nrm([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);

// ── L pochylenie ─────────────────────────────────────────────────────────────────────────
console.log('\nL lean towards the camera');
if (!PL.leanUp || !PL.screenUpOf) missing(['L1a', 'L1b', 'L1c', 'L1d'], 'leanUp / screenUpOf'); else {
  const k = PL.UNIT_POLISH.lean;
  assert(typeof k === 'number' && k > 0.3 && k < 0.8, `L1a one tuning constant UNIT_POLISH.lean = ${k} (0 < k < 0.8)`);
  const eye = nrm([0.3, 0.5, 0.81]), up = PL.screenUpOf(eye);
  const c0 = PL.leanUp(eye, eye, up, k);
  const tilt = Math.acos(Math.max(-1, Math.min(1, dot(c0, eye))));
  assert(near(tilt, Math.atan(k / (1 - k)), 1e-9) && dot(c0, up) > 0 && near(dot(c0, cross(eye, up)), 0, 1e-12),
    `L1b disc centre (normal = view axis): the model tilts ${(tilt * 180 / Math.PI).toFixed(1)}° towards screen-up — seen from the side`);
  const limb = nrm(cross(eye, up)), back = [-eye[0], -eye[1], -eye[2]];
  assert(vnear(PL.leanUp(limb, eye, up, k), limb, 1e-12) && vnear(PL.leanUp(up, eye, up, k), up, 1e-12) && vnear(PL.leanUp(back, eye, up, k), back) && vnear(PL.leanUp(eye, eye, up, 0), eye),
    'L1c at the limb, on the far side and with k = 0 the model stays on the tile normal');
  let minAbove = 2, maxJump = 0, prev = null;
  for (let i = 0; i < 4000; i++) {
    const n = randDir(); if (dot(n, eye) <= 0) continue;
    const l = PL.leanUp(n, eye, up, k); minAbove = Math.min(minAbove, dot(l, n));
  }
  for (let a = 0; a <= Math.PI / 2; a += 0.01) { const n = nrm([eye[0] * Math.cos(a) - up[0] * Math.sin(a), eye[1] * Math.cos(a) - up[1] * Math.sin(a), eye[2] * Math.cos(a) - up[2] * Math.sin(a)]); const l = PL.leanUp(n, eye, up, k); if (prev) maxJump = Math.max(maxJump, len([l[0] - prev[0], l[1] - prev[1], l[2] - prev[2]])); prev = l; }
  assert(minAbove > 0.05 && maxJump < 0.05, `L1d always above the tangent plane of its tile (min up'·n ${minAbove.toFixed(3)}) and continuous across the disc (max step ${maxJump.toFixed(3)})`);
  if (SL.cameraBasis) {
    let worst = 0;
    for (let i = 0; i < 50; i++) { const v = { lon: rnd() * 6.28, lat: (rnd() - 0.5) * 2.6, dist: 2.5 }; const b = SL.cameraBasis(v); const e = [-b.fwd[0], -b.fwd[1], -b.fwd[2]]; const u = PL.screenUpOf(e); worst = Math.max(worst, len([u[0] - b.up[0], u[1] - b.up[1], u[2] - b.up[2]])); }
    assert(worst < 1e-9, 'L1e screen-up of the lean = the up vector of the sphere camera (cameraBasis) for any view');
  } else assert(false, 'L1e cameraBasis missing');
}
if (!UL.instanceMatrix || !PL.leanUp) missing(['L2a', 'L2b'], 'instanceMatrix(upAxis)'); else {
  const dir = C(A), heading = nrm(cross(dir, [0, 1, 0])), it = { dir, heading, share: 0.5, height: 0 };
  const sp = 0.2, plain = UL.instanceMatrix(it, sp), same = UL.instanceMatrix(it, sp, undefined, new Array(16), null);
  assert(plain.every((x, i) => x === same[i]), 'L2a no lean axis → the CS-10 matrix bit for bit');
  const eye = nrm([dir[0] + 0.1, dir[1] + 0.05, dir[2]]), upv = PL.leanUp(dir, eye, PL.screenUpOf(eye), PL.UNIT_POLISH.lean);
  const m = UL.instanceMatrix(it, sp, undefined, new Array(16), upv), s = it.share * sp;
  const Y = [m[4] / s, m[5] / s, m[6] / s], Z = [m[8] / s, m[9] / s, m[10] / s], T = [m[12], m[13], m[14]];
  const h = 1 + UL.UNIT_VIEW.lift;
  assert(vnear(Y, upv, 1e-12) && vnear(T, [dir[0] * h, dir[1] * h, dir[2] * h], 1e-12) && near(dot(Y, Z), 0, 1e-12) && dot(Z, heading) > 0.9,
    'L2b leaned matrix: model Y = the leaned axis, base still on the tile (translation along the tile normal), Z keeps the march heading');
  const par = UL.instanceMatrix({ ...it, heading: upv }, sp, undefined, new Array(16), upv);
  assert(par.every(Number.isFinite) && len([par[8], par[9], par[10]]) > s * 0.99, 'L2c heading parallel to the leaned axis → fallback heading (no zero column / NaN)');
}
{
  const um = stripComments(src('src/renderer/ColonyUnitModels.js')), rr = stripComments(src('src/renderer/ColonySphereRenderer.js')), hv = stripComments(src('src/ui/ColonySphereUnits.js'));
  assert(/setInstances\(groups, spacing, view = null\)/.test(um) && /const up = view && view\.lean > 0 \? leanUp\(it\.dir, view\.eye, view\.up, view\.lean\) : null;\s*m4\.fromArray\(instanceMatrix\(it, spacing, undefined, arr, up\)\);/.test(um),
    'L3a GL layer: every instance gets leanUp(tile normal, eye, screen-up, lean)');
  assert(/setInstances\(this\._unitGroups, Math\.sqrt\(4 \* Math\.PI \/ this\._topo\.count\), this\.unitView\(\)\)/.test(rr) && /lean: this\.unitLean \?\? UNIT_POLISH\.lean/.test(rr) && /up: screenUpOf\(eye\)/.test(rr),
    'L3b renderer hands the layer its camera view (eye + screen-up) and the lean constant (unitLean, default UNIT_POLISH.lean)');
  assert(/const up = view && view\.lean > 0 \? leanUp\(it\.dir, view\.eye, view\.up, view\.lean\) : it\.dir;/.test(hv) && /const view = r\.unitView\?\.\(\) \?\? null;/.test(hv),
    'L3c HUD: bars / hit box follow the leaned head (same axis as the GL layer)');
}

// ── P trasa ──────────────────────────────────────────────────────────────────────────────
console.log('\nP move order path');
const nb = topo.neighbors(A), nb2 = topo.neighbors(nb[0]).find(i => i !== A && !nb.includes(i)), nb3 = topo.neighbors(nb2).find(i => i !== nb[0] && i !== A && !topo.neighbors(nb[0]).includes(i));
if (!PL.movePathTiles || !PL.pathPolyline) missing(['P1a', 'P1b', 'P2a', 'P2b', 'P2c'], 'movePathTiles / pathPolyline'); else {
  const mv = unit(A, { status: 'moving', _path: [{ q: nb[0], r: -1 }, { q: nb2, r: -1 }, { q: nb3, r: -1 }], _animT: 0.4 });
  assert(JSON.stringify(PL.movePathTiles(mv)) === JSON.stringify([A, nb[0], nb2, nb3]), 'P1a path tiles = current tile + the remaining A* steps (unit._path)');
  assert(PL.movePathTiles(unit(A)).length === 0 && PL.movePathTiles({ ...mv, status: 'idle' }).length === 0 && PL.movePathTiles({ ...mv, q: 3, r: 4, _path: [{ q: 4, r: 4 }] }).length === 0,
    'P1b no path when idle / no steps / flat-grid coordinates');
  const tiles = [A, nb[0], nb2, nb3], st = PL.UNIT_POLISH.pathArcSteps;
  const { points, tileIdx } = PL.pathPolyline(topo, tiles);
  assert(points.length === (tiles.length - 1) * st + 1 && tileIdx.length === tiles.length && tileIdx.every((pi, k) => vnear(points[pi], C(tiles[k]), 0)),
    `P2a polyline vertices on the tile centres EXACTLY (${tileIdx.length} centres, ${points.length} points)`);
  let off = 0;
  for (let k = 0; k < tiles.length - 1; k++) { const pn = nrm(cross(C(tiles[k]), C(tiles[k + 1]))); for (let j = tileIdx[k]; j <= tileIdx[k + 1]; j++) off = Math.max(off, Math.abs(dot(points[j], pn)), Math.abs(len(points[j]) - 1)); }
  assert(off < 1e-12, 'P2b every point lies on the great circle between consecutive tile centres (on the surface)');
  const tr = PL.pathPolyline(topo, tiles, { startT: 0.4 });
  const a = C(A), b = C(nb[0]), ang = Math.acos(dot(a, b)), pa = Math.acos(Math.min(1, dot(tr.points[0], a)));
  assert(near(pa, 0.4 * ang, 1e-9) && tr.tileIdx.length === tiles.length - 1 && vnear(tr.points[tr.points.length - 1], C(nb3), 0), 'P2c startT trims the first arc to the unit position; the end stays on the destination centre');
}
if (!PL.arrowHead || !PL.pathAlpha) missing(['P3', 'P4'], 'arrowHead / pathAlpha'); else {
  const ah = PL.arrowHead([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 8);
  assert(ah && ah.tip.x === 20 && near(ah.left.x, 12) && near(ah.right.x, 12) && near(ah.left.y, -ah.right.y) && Math.abs(ah.left.y) > 1 && PL.arrowHead([{ x: 1, y: 1 }], 8) === null,
    'P3 arrow head at the last point, arms symmetric behind the tip along the last segment');
  const F = PL.UNIT_POLISH.pathFadeMs;
  assert(PL.pathAlpha({ moving: true }) === 1 && PL.pathAlpha({ moving: false, arrivedAt: 1000, now: 1000 }) === 1 && near(PL.pathAlpha({ moving: false, arrivedAt: 1000, now: 1000 + F / 2 }), 0.5)
    && PL.pathAlpha({ moving: false, arrivedAt: 1000, now: 1000 + F }) === 0 && PL.pathAlpha({ moving: false }) === 0, `P4 path opaque while moving, fades out over ${F} ms after arrival`);
}
function fakeCanvas() { const c2d = { clearRect() {}, drawImage() {} }; return { width: 2, height: 2, getContext: () => c2d, addEventListener() {}, removeEventListener() {} }; }
function countCtx() {
  const calls = { stroke: 0, fill: 0, ellipse: 0, lineTo: 0, fillText: 0 }, texts = [];
  return new Proxy({}, { get: (_, k) => (k === 'getTransform' ? () => ({ a: 1 }) : k === 'calls' ? calls : (k === 'texts' ? texts : (k === 'measureText' ? () => ({ width: 40 }) : (k === 'createRadialGradient' ? () => ({ addColorStop() {} })
    : (...a) => { if (k in calls) calls[k]++; if (k === 'fillText') texts.push(a[0]); })))), set: () => true });
}
const views = [];
const mkRenderer = () => new RMOD.ColonySphereRenderer({ THREE, now: () => 0, getCache: () => null, getWeatherRate: () => 0, createCanvas: fakeCanvas,
  createGL: () => ({ render() {}, setSize() {}, dispose() {}, forceContextLoss() {}, getContext: () => null }),
  createUnitLayer: () => { const l = { n: 0, stateOf: () => 'ready', setInstances: (g, s, v) => { views.push(v); l.n = g ? [...g.values()].reduce((q, x) => q + x.items.length, 0) : 0; return l.n; },
    render: (gl) => { if (l.n <= 0) return false; gl.render(l, null); return true; }, disposeGL() {}, info: () => ({ instances: l.n, groups: 1, drawCalls: 1, triangles: 0, states: {} }) }; return l; } });
const rect = { x: 0, y: 0, w: 800, h: 600 };
let r = null;
if (!UV.ColonySphereUnits || !RMOD?.ColonySphereRenderer?.prototype?.unitView) missing(['P5a', 'P5b', 'P5c', 'L3d'], 'ColonySphereUnits paths / renderer.unitView'); else {
  r = mkRenderer();
  r.setBody({ body: terranBody(), n: grid.n, star: {}, capitalTile: A });
  r.draw(countCtx(), rect);
  let clock = 1000;
  const uv = new UV.ColonySphereUnits({ renderer: r, now: () => clock });
  const mv = unit(A, { status: 'moving', _path: [{ q: nb[0], r: -1 }, { q: nb2, r: -1 }], _animT: 0.2 });
  const en = foe(nb3, { status: 'moving', _path: [{ q: nb2, r: -1 }] });
  uv.lodBias = 'models';
  uv.sync({ units: [mv, en], grid, archetypes: UNIT_ARCHETYPES }, rect);
  r.draw(countCtx(), rect);
  const c = countCtx(); uv.draw(c, rect);
  const i1 = uv.info();
  assert(i1.paths.drawn === 1 && uv._paths.has(mv.id) && !uv._paths.has(en.id) && c.calls.ellipse >= 1 && c.calls.fill >= 1,
    'P5a moving own unit: path with arrow and destination ring drawn; the enemy\'s order is NOT shown');
  mv.status = 'idle'; mv._path = []; mv.q = nb2; clock = 1100;
  uv.sync({ units: [mv, en], grid, archetypes: UNIT_ARCHETYPES }, rect); uv.draw(countCtx(), rect);
  const fadeDelay = uv.nextFrameDelayMs();
  assert(uv._paths.get(mv.id)?.arrivedAt === 1100 && uv.info().paths.fading === 1 && fadeDelay <= 1000 / 20 + 1e-9, `P5b on arrival the path fades (frames requested every ${fadeDelay.toFixed(0)} ms while it fades)`);
  clock = 1100 + PL.UNIT_POLISH.pathFadeMs + 1;
  uv.sync({ units: [mv, en], grid, archetypes: UNIT_ARCHETYPES }, rect); uv.draw(countCtx(), rect);
  assert(!uv._paths.has(mv.id) && uv.info().paths.drawn === 0, 'P5c faded path removed');
  const v = views.filter(Boolean).pop(), uvw = r.unitView();
  assert(!!v && vnear(v.eye, uvw.eye) && vnear(v.up, PL.screenUpOf(uvw.eye)) && v.lean === PL.UNIT_POLISH.lean, 'L3d executed: the GL layer receives the camera eye, screen-up and the lean constant');
  r.unitLean = 0; r._unitSig = 'x'; r.setUnits(r._unitGroups); r.draw(countCtx(), rect);
  assert(views[views.length - 1]?.lean === 0, 'L3e unitLean = 0 (owner toggle) → upright models');
  r.unitLean = undefined;
}

// ── S zaznaczenie ────────────────────────────────────────────────────────────────────────
console.log('\nS selection');
if (!PL.unitClickSelection || !PL.pickUnitBox) missing(['S1a', 'S1b', 'S1c', 'S1d', 'S2'], 'unitClickSelection / pickUnitBox'); else {
  const S = PL.unitClickSelection;
  const r1 = S({ ids: ['a'], primaryId: 'a', clickedId: 'b', mods: { ctrl: true } }), r2 = S({ ids: r1.ids, primaryId: r1.primaryId, clickedId: 'c', mods: { shift: true } });
  assert(JSON.stringify(r2) === JSON.stringify({ ids: ['a', 'b', 'c'], primaryId: 'c' }), 'S1a Ctrl + click / Shift + click ADD a unit (it becomes the primary)');
  const r3 = S({ ids: ['a', 'b', 'c'], primaryId: 'c', clickedId: 'c', mods: { ctrl: true } }), r4 = S({ ids: ['a'], primaryId: 'a', clickedId: 'a', mods: { shift: true } });
  assert(JSON.stringify(r3) === JSON.stringify({ ids: ['a', 'b'], primaryId: 'a' }) && JSON.stringify(r4) === JSON.stringify({ ids: [], primaryId: null }), 'S1b Ctrl / Shift on a selected unit REMOVES it (primary moves to the first remaining)');
  const r5 = S({ ids: ['x'], primaryId: 'x', clickedId: 'a', mods: {}, armyIds: ['a', 'b', 'c'] }), r6 = S({ ids: ['a', 'b', 'c'], primaryId: 'a', clickedId: 'b', mods: {}, armyIds: ['a', 'b', 'c'] });
  assert(JSON.stringify(r5) === JSON.stringify({ ids: ['a', 'b', 'c'], primaryId: 'a' }) && r6.ids.length === 0, 'S1c plain click on a unit of an army selects the whole army; again → deselect (flat-map rule)');
  const r7 = S({ ids: ['a', 'b'], primaryId: 'a', clickedId: 'c', mods: {} }), r8 = S({ ids: ['c'], primaryId: 'c', clickedId: 'c', mods: {} });
  assert(JSON.stringify(r7) === JSON.stringify({ ids: ['c'], primaryId: 'c' }) && r8.ids.length === 0, 'S1d plain click replaces the selection with the unit; on the only selected unit → deselect');
  const P = PL.pickUnitBox, bx = [{ id: 'far', x0: 0, x1: 50, y0: 0, y1: 50, facing: 0.5 }, { id: 'near', x0: 20, x1: 60, y0: 20, y1: 60, facing: 0.9 }, { id: 'small', x0: 22, x1: 30, y0: 22, y1: 30, facing: 0.9 }];
  assert(P(bx, 10, 10).id === 'far' && P(bx, 40, 40).id === 'near' && P(bx, 25, 25).id === 'small' && P(bx, 200, 200) === null && P(bx, 52, 52, 4)?.id === 'near',
    'S2 hit box: inside wins, nearer the camera wins, same depth → smaller box (single unit before a stack), padding');
}
if (!r || !UV.ColonySphereUnits?.prototype?.pickUnit) missing(['S3a', 'S3b'], 'ColonySphereUnits.pickUnit'); else {
  const uv = new UV.ColonySphereUnits({ renderer: r, now: () => 0 });
  const st = [unit(A), unit(A), unit(A)], bt = [unit(nb[0]), foe(nb[0])];
  uv.lodBias = 'markers'; uv.sync({ units: [...st, ...bt], grid, archetypes: UNIT_ARCHETYPES, battleAt: (i) => i === nb[0] }, rect); uv.draw(countCtx(), rect);
  const pA = r.projectDirection(...C(A), rect), hit = uv.pickUnit(pA.x, pA.y);
  assert(!!hit && st.some(u => u.id === hit.id) && hit.ids.length === 3, 'S3a far LOD: the stack marker is a hit box carrying all 3 ids (click selects its first unit, as the flat map)');
  const b = uv._battleBoxes[0];
  assert(!!b && uv.pickBattle((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) === nb[0] && uv.pickBattle(-50, -50) === null, 'S3b the crossed-blades marker of a contested tile is clickable (pickBattle → tile)');
  uv.lodBias = 'models'; uv.sync({ units: st, grid, archetypes: UNIT_ARCHETYPES }, rect); r.draw(countCtx(), rect); uv.draw(countCtx(), rect);
  const ids = new Set(uv._boxes.map(x => x.id));
  assert(st.every(u => ids.has(u.id)) && uv._boxes.every(x => x.y0 < x.y1 && x.x0 < x.x1), 'S3c near LOD: every drawn model has its own hit box (base → leaned head)');
}
// ColonyOverlay._sphereClick WYKONANIEM — tekst metody z pliku, zależności wstrzyknięte
const co = src('src/ui/ColonyOverlay.js'), coc = stripComments(co);
const scSrc = body(co, '  _sphereClick(colony, grid, tile, x, y) {');
let sphereClick = null;
if (scSrc && PL.unitClickSelection) {
  try { sphereClick = new Function('tileGraphOf', 'isGroundUnitVisibleToPlayer', 'unitClickSelection', 'window', `return function ${scSrc.trim()}`)(tileGraphOf, (K, u) => !!u && !u.hidden, PL.unitClickSelection, globalThis); } catch (e) { console.log('    (eval)', e.message); }
}
if (!sphereClick) missing(['S4a', 'S4b', 'S4c', 'S4d', 'B3a', 'B3b'], 'ColonyOverlay._sphereClick'); else {
  const us = new Map(), add = (u) => (us.set(u.id, u), u);
  const a = add(unit(A)), b = add(unit(A)), c = add(unit(nb[1])), e = add(foe(nb[2])), w1 = add(unit(nb[0])), w2 = add(foe(nb[0]));
  const armies = new Map();
  globalThis.window = globalThis.window ?? globalThis;
  window.KOSMOS = { groundUnitManager: { getUnit: (id) => us.get(id) ?? null }, armySystem: { getArmyForUnit: (id) => armies.get(id) ?? null },
    combatSystem: { isBattleAt: (pid, q) => q === nb[0] } };
  const colony = { planetId: 'p_terran', grid };
  let pick = null, pickB = null;
  const ov = { _selectedUnits: new Set(), _selectedUnit: null, _selectedHex: null, _lastMouseMods: { shift: false, ctrl: false }, _cBattle: null,
    _sphere: { units: { pickUnit: () => pick, pickBattle: () => pickB } } };
  const click = (id, mods = {}) => { pick = id ? { id, ids: [id] } : null; pickB = null; ov._lastMouseMods = { shift: !!mods.shift, ctrl: !!mods.ctrl }; return sphereClick.call(ov, colony, grid, tileGraphOf(grid).tile({ q: A, r: -1 }), 1, 1); };
  click(a.id); click(b.id, { ctrl: true }); click(c.id, { shift: true });
  assert([...ov._selectedUnits].join() === [a.id, b.id, c.id].join() && ov._selectedUnit === c, 'S4a executed: click + Ctrl + click + Shift + click on models → 3 units selected (primary = last)');
  click(b.id, { ctrl: true });
  assert([...ov._selectedUnits].join() === [a.id, c.id].join(), 'S4b executed: Ctrl + click on a selected model removes it');
  const before = [...ov._selectedUnits].join(); const ret = click(e.id, { ctrl: true });
  assert(ret === true && [...ov._selectedUnits].join() === before, 'S4c executed: Ctrl + click on an enemy changes nothing (as _toggleInSelection)');
  armies.set(a.id, { members: new Set([a.id, b.id]) }); armies.set(b.id, armies.get(a.id));
  click(a.id);
  assert([...ov._selectedUnits].sort().join() === [a.id, b.id].sort().join() && ov._selectedHex?.q === A, 'S4d executed: plain click on an army unit selects the army; the tile is remembered');
  pick = null; const ret2 = click(null);
  assert(ret2 === false, 'S4e executed: no model under the cursor → today\'s tile path continues (unit from the tile, build panel)');
  // B3 — okno bitwy
  ov._cBattle = null; pickB = nb[0]; pick = null; ov._lastMouseMods = {};
  const rb = sphereClick.call(ov, colony, grid, tileGraphOf(grid).tile({ q: A, r: -1 }), 1, 1);
  assert(rb === true && ov._cBattle?.q === nb[0] && ov._cBattle?.planetId === 'p_terran', 'B3a executed: click on the battle marker opens the battle window for that tile');
  ov._cBattle = null; pickB = null; pick = null;
  const rt = sphereClick.call(ov, colony, grid, tileGraphOf(grid).tile({ q: nb[0], r: -1 }), 1, 1);
  const r3 = (ov._cBattle = null, sphereClick.call(ov, colony, grid, tileGraphOf(grid).tile({ q: A, r: -1 }), 1, 1), ov._cBattle);
  ov._cBattle = null; pick = { id: w1.id, ids: [w1.id] };
  sphereClick.call(ov, colony, grid, tileGraphOf(grid).tile({ q: A, r: -1 }), 1, 1);
  assert(rt === false && r3 === null && ov._cBattle?.q === nb[0], 'B3b executed: click on a contested tile (or a unit standing on it) opens the window; a quiet tile does not');
  delete window.KOSMOS;
}
{
  const hc = body(co, '  handleClick(x, y) {');
  assert(/if \(isSphereGrid\(grid\) && colony && this\._sphereClick\(colony, grid, tile, x, y\)\) return true;/.test(stripComments(hc)) && /this\._toggleInSelection\(unitOnTile\);/.test(hc)
    && /const unitOnTile = visibleGroundUnitAt\(window\.KOSMOS, colony\?\.planetId, tile\.q, tile\.r\);/.test(hc),
    'S5 wiring: the sphere click runs first only on sphere grids; the flat-map selection code is unchanged below it');
}

// ── B okno bitwy ─────────────────────────────────────────────────────────────────────────
console.log('\nB ground battle window');
if (!PL.battleWindowModel || !PL.battleWindowRect) missing(['B1', 'B2'], 'battleWindowModel / battleWindowRect'); else {
  const st = { sides: { player: [unit(A, { hp: 5 }), unit(A, { hp: 0 })], emp_001: [foe(A, { hp: 10 }), foe(A, { hp: 2 })] }, round: 3 };
  const m = PL.battleWindowModel(st, UNIT_ARCHETYPES, 'plains'), hpMax = UNIT_ARCHETYPES.shock_infantry.baseStats.hp;
  assert(m && m.round === 3 && m.own.length === 1 && m.enemy.length === 2 && m.ownHp === 5 && m.enemyHp === 12 && m.ownHpMax === hpMax && m.terrainKey === 'plains' && near(m.own[0].hpFrac, 5 / hpMax)
    && PL.battleWindowModel(null) === null && PL.battleWindowModel({ sides: {} }) === null, 'B1 battle model: own vs enemy side, dead units dropped, HP sums from the archetype, round, terrain; no battle → null');
  const zones = { hero: { x: 100, y: 50, w: 900, h: 600 }, inspector: { x: 760, y: 300, w: 300, h: 300 } }, br = PL.battleWindowRect(zones, 200);
  assert(br.y === 58 && br.x + br.w === 752 && br.x >= 108 && br.h === 200 && PL.battleWindowRect({}, 100) === null, 'B2 window at the top of the hero, next to the inspector zone (left of it)');
}
if (!BW.drawBattleWindow) missing(['B4a', 'B4b'], 'drawBattleWindow'); else {
  const own = unit(A, { hp: 6 }), en = foe(A, { hp: 9 });
  let alive = true;
  window.KOSMOS = { combatSystem: { getBattleStateAt: () => (alive ? { sides: { player: [own], emp_001: [en] }, round: 2 } : null) }, colonyManager: { getColony: () => ({ grid }) } };
  const zones = [], ov = { _cBattle: { planetId: 'p_terran', q: A, r: -1 }, _hoverZone: null, _addHit: (x, y, w, h, type, data) => zones.push({ type, data }), _graphFor: () => tileGraphOf(grid) };
  const roles = { primary: '#0ff', dim: '#555', alert: '#f50', positive: '#0f0' };
  const c = countCtx(), h = BW.drawBattleWindow(ov, c, { hero: { x: 0, y: 0, w: 1000, h: 700 }, inspector: { x: 700, y: 300, w: 300, h: 300 } }, roles);
  const types = zones.map(z => z.type);
  assert(h > 0 && types.includes('cBattleClose') && types.includes('cBattleSelectOwn') && zones.filter(z => z.type === 'drawerUnitClick').map(z => z.data.unitId).join() === own.id && types[types.length - 1] === 'floatPanel',
    'B4a executed: window draws both sides; zones close / select own / own unit rows (enemy rows not clickable) + absorber last');
  alive = false; const h2 = BW.drawBattleWindow(ov, countCtx(), { hero: { x: 0, y: 0, w: 1000, h: 700 }, inspector: { x: 700, y: 300, w: 300, h: 300 } }, roles);
  assert(h2 === 0 && ov._cBattle === null, 'B4b executed: battle over → the window closes itself');
  delete window.KOSMOS;
}
{
  const oh = body(co, '  _onHit(zone) {');
  assert(/case 'cBattleClose': \{ this\._cBattle = null; break; \}/.test(oh) && /case 'cBattleSelectOwn': \{[\s\S]*?getUnitsAtHex\?\.\(zone\.data\.planetId, zone\.data\.q, zone\.data\.r\)[\s\S]*?this\._selectedUnits\.add\(u\.id\)/.test(oh),
    'B5a zones: close, select own units on the contested tile');
  assert(/if \(this\._cBattle && colony && this\._cBattle\.planetId === colony\.planetId\) drawBattleWindow\(this, ctx, z, roles\);/.test(coc) && /this\._selectedUnit = null; this\._selectedUnits\.clear\(\); this\._cBattle = null;/.test(coc),
    'B5b the console draws the window for the shown colony only; switching colony closes it');
  const en = src('src/i18n/en.js'), pl = src('src/i18n/pl.js'), keys = ['title', 'round', 'own', 'enemy', 'selectOwn', 'noOwn', 'retreatHint'];
  assert(keys.every(k => en.includes(`'colonyBattle.${k}':`) && pl.includes(`'colonyBattle.${k}':`)), 'B6 i18n: colonyBattle.* in EN and PL');
}

// ── F płaska mapa / flaga OFF ────────────────────────────────────────────────────────────
console.log('\nF flat map and helpers');
{
  const du = body(co, '  _drawUnits(ctx, ox, oy, ow, oh, grid) {');
  assert(du.length > 3000 && !/ColonyUnitPolish|_sphereClick|_cBattle|leanUp/.test(du), 'F1 flat colonies: _drawUnits untouched by CS-10b');
  const logic = stripComments(src('src/renderer/ColonyUnitPolishLogic.js'));
  assert(logic.length > 2000 && !/\bimport\b/.test(logic) && !/window\.|document\.|Math\.random|Date\.now/.test(logic), 'F2 polish logic is pure (no imports, no DOM, no randomness)');
  const dbg = src('src/debug/ColonyUnitsPolishDebug.js'), gs = src('src/scenes/GameScene.js'), sd = src('src/debug/ColonySphereDebug.js');
  assert(/export function colonyUnitsPolishDebugHelpers\(\) \{ return \{ csUnitLean, csUnitSelect3, csUnitPath, csBattleWindow, csGroundBattle, csBattleRound \}; \}/.test(dbg) && /\.\.\.colonyUnitsPolishDebugHelpers\(\)/.test(sd)
    && /for \(const k of \['csUnitLean', 'csUnitSelect3', 'csUnitPath', 'csBattleWindow', 'csGroundBattle', 'csBattleRound'\]\) window\[k\]/.test(gs) && /_sphereClick\(/.test(dbg),
    'F3 owner helpers registered (csUnitLean, csUnitSelect3, csUnitPath, csBattleWindow, csGroundBattle, csBattleRound); csUnitSelect3 goes through the real click path');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
