// ARC COLONY SPHERE CS-10 — keeper jednostek naziemnych na kuli kolonii (plan §3.19, D-CS-14).
//
//   U1  LOD: próg po rozmiarze pola, podgląd (zawsze modele / zawsze znaczniki), brak WebGL → znaczniki
//   U2  wariant _mobile / _deployed: ta sama reguła co mapa 2D; kandydaci pliku (wariant, potem bazowy GLB)
//   U3  krok po wielkim kole: start / koniec DOKŁADNIE na środkach pól, punkty na łuku, kąt ∝ t, zwrot ku celowi
//   U4  rozstawienie: środek pola, pole z budynkiem → przed portretem (południe), stos = rząd, pole sporne = strony
//       naprzeciw siebie, limit modeli na stronę, ukryty wróg i siatka płaska pominięte, marsz poza stosem
//   U5  grupy instancji: klucz modelu = grupa, wariant rozdziela grupy, podpis warstwy zmienia się z ruchem
//   U6  macierz instancji: baza ortonormalna × skala, oś Y = normalna pola, oś Z = zwrot, podstawa na powierzchni
//   U7  ColonyUnitModels WYKONANIEM (three r171, atrapa loadera): szablon raz na plik, normalizacja, zapasowy bazowy
//       GLB, brak plików → missing, InstancedMesh na część, wzrost pojemności, zwolnienie
//   U8  renderer kuli WYKONANIEM: zmiana jednostek → render, przebieg modeli PRZED kulą, kompozycja warstwy, błąd
//       warstwy nie gasi kuli, brak jednostek → brak przebiegu
//   U9  widok WYKONANIEM: daleko znaczniki z licznikiem, blisko grupy modeli, model niegotowy → znacznik, bitwa,
//       lądowanie, tempo klatek (marsz / pauza / bezruch)
//   U10 budżet GLB: każdy model w ścieżce gry ≤ limit bajtów i trójkątów; oryginały poza ścieżką gry
//   U12 offline: RoomEnvironment z lokalnej kopii src/lib/addons (bez CDN), r171 jak lokalne three
//   U11 okablowanie: ColonyOverlay (reguła widoczności, kolejność sync → kula → jednostki), mapa 2D nietknięta,
//       desant tylko dla siatki geo, pomocniki właściciela, brak importów z systemów gry
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-10) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
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

const UL = (await tryImport('../../renderer/ColonyUnitLogic.js')) ?? {};
const UM = (await tryImport('../../renderer/ColonyUnitModels.js')) ?? {};
const UV = (await tryImport('../../ui/ColonySphereUnits.js')) ?? {};
const VIEW = (await tryImport('../../ui/ColonySphereView.js')) ?? {};
const RMOD = await tryImport('../../renderer/ColonySphereRenderer.js');
const { generateGeoGrid } = await import('../../map/GeoColonyGridGenerator.js');
const { geodesicTopology } = await import('../../map/GeodesicTopology.js');
const { tileGraphOf } = await import('../../map/TileGraph.js');
const { UNIT_ARCHETYPES } = await import('../../data/unitArchetypes.js');
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);

const terranBody = (extra = {}) => ({ id: 'p_terran', type: 'planet', bodyArchetype: 'terran', surfaceSeed: 0xC57B, systemId: 'sys_home', atmosphere: 'breathable',
  waterCoverage: 0.6, temperatureC: 15, surface: { hasWater: true }, name: 'Terra', deposits: [], ...extra });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const grid = generateGeoGrid(terranBody(), true);
const topo = geodesicTopology(grid.n);
const C = (i) => [topo.cx[i], topo.cy[i], topo.cz[i]];
const spacing = Math.sqrt(4 * Math.PI / topo.count);
const POLE = Array.from({ length: topo.count }, (_, i) => i).find(i => Math.abs(topo.cy[i]) > 0.999);
const A = Array.from({ length: topo.count }, (_, i) => i).find(i => i >= 40 && Math.abs(topo.cy[i]) < 0.6 && !topo.neighbors(i).includes(POLE)), B = topo.neighbors(A)[0];
let uid = 0;
const unit = (q, extra = {}) => ({ id: `u${++uid}`, q, r: -1, owner: 'player', status: 'idle', archetypeId: 'shock_infantry', factionId: 'humanity',
  sprite: 'assets/units/ground/humanity/human_marines.png', hp: 10, hpMax: 10, _animT: 0, _path: [], ...extra });
const foe = (q, extra = {}) => unit(q, { owner: 'emp_001', factionId: 'emp_001', sprite: 'assets/units/ground/UNE/une_marines.png', ...extra });
const garrison = (q, deployState) => unit(q, { archetypeId: 'garrison_unit', deployState, sprite: 'assets/units/ground/humanity/human_garrison.png' });

// ── U1 LOD ─────────────────────────────────────────────────────────────────────────────
console.log('\nU1 unit LOD');
if (!UL.unitLodOf) missing(['U1a', 'U1b', 'U1c'], 'ColonyUnitLogic'); else {
  const T = UL.UNIT_VIEW, L = UL.UNIT_LOD, Bi = UL.UNIT_LOD_BIAS;
  assert(UL.unitLodOf(T.modelAbovePx) === L.MODEL && UL.unitLodOf(T.modelAbovePx - 0.5) === L.MARKER && UL.unitLodOf(400) === L.MODEL && UL.unitLodOf(10) === L.MARKER,
    `U1a threshold by on-screen tile size: tile ≥ ${T.modelAbovePx} px → GLB models, smaller → compact marker (D-CS-14)`);
  assert(UL.unitLodOf(10, { bias: Bi.MODELS }) === L.MODEL && UL.unitLodOf(400, { bias: Bi.MARKERS }) === L.MARKER && UL.unitLodOf(400, { bias: Bi.AUTO }) === L.MODEL,
    'U1b owner preview: always models / always markers / auto');
  assert(UL.unitLodOf(400, { gl: false }) === L.MARKER && UL.unitLodOf(400, { gl: false, bias: Bi.MODELS }) === L.MARKER, 'U1c no WebGL → markers, whatever the zoom or the preview');
}

// ── U2 wariant i kandydaci pliku ───────────────────────────────────────────────────────────
console.log('\nU2 mobile / deployed swap');
if (!UL.unitVariantOf) missing(['U2a', 'U2b', 'U2c', 'U2d'], 'ColonyUnitLogic'); else {
  const G = UNIT_ARCHETYPES.garrison_unit, I = UNIT_ARCHETYPES.shock_infantry, v = UL.unitVariantOf;
  assert(G?.supportsDeploy === true && v({ deployState: 'mobile' }, G) === 'mobile' && v({ deployState: 'deploying' }, G) === 'mobile'
    && v({ deployState: 'deployed' }, G) === 'deployed' && v({ deployState: 'packing' }, G) === 'deployed',
  'U2a mobile / deploying → _mobile, deployed / packing → _deployed');
  assert(v({ deployState: 'mobile' }, I) === null && v({ deployState: null }, G) === null && v({ deployState: 'deployed' }, null) === null, 'U2b only archetypes with supportsDeploy and a deploy state have a variant');
  const cm = UL.unitModelCandidates(garrison(A, 'mobile'), G), cd = UL.unitModelCandidates(garrison(A, 'packing'), G), ci = UL.unitModelCandidates(unit(A, { deployState: 'mobile' }), I);
  assert(cm.join() === 'assets/units/ground/humanity/human_garrison_mobile.glb,assets/units/ground/humanity/human_garrison.glb'
    && cd[0] === 'assets/units/ground/humanity/human_garrison_deployed.glb' && cd[1] === 'assets/units/ground/humanity/human_garrison.glb'
    && ci.join() === 'assets/units/ground/humanity/human_marines.glb' && UL.unitModelCandidates({ sprite: null }, I).length === 0,
  'U2c model file candidates: variant first, base GLB as the fallback; no sprite path → no model (marker)');
  const co = stripComments(src('src/ui/ColonyOverlay.js'));
  assert(/const variant = \(unit\.deployState === 'mobile' \|\| unit\.deployState === 'deploying'\)\s*\? 'mobile' : 'deployed';/.test(co)
    && /if \(variant && !this\._deployArchetypes\?\.\[archetypeId\]\?\.supportsDeploy\) return null;/.test(co) && /basePath\.replace\(\/\(\\\.\[a-z\]\+\)\$\/i, `_\$\{variant\}\$1`\)/.test(co),
  'U2d the 2D map rule this mirrors is still in ColonyOverlay (same states, same supportsDeploy gate, same file suffix)');
}

// ── U3 krok po wielkim kole ────────────────────────────────────────────────────────────
console.log('\nU3 great-circle step');
if (!UL.greatCircleStep) missing(['U3a', 'U3b', 'U3c', 'U3d'], 'ColonyUnitLogic'); else {
  const a = C(A), b = C(B), s0 = UL.greatCircleStep(a, b, 0), s1 = UL.greatCircleStep(a, b, 1);
  assert(s0.dir.every((v, k) => v === a[k]) && s1.dir.every((v, k) => v === b[k]), 'U3a start and end are exactly the tile centres (t = 0 → A, t = 1 → B)');
  const n = cross(a, b), om = Math.acos(dot(a, b));
  let onArc = true, prop = true, facing = true;
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const s = UL.greatCircleStep(a, b, t);
    onArc = onArc && Math.abs(dot(s.dir, n)) < 1e-12 && near(len(s.dir), 1, 1e-12);
    prop = prop && near(Math.acos(Math.min(1, dot(a, s.dir))), t * om, 1e-9);
    facing = facing && near(len(s.heading), 1, 1e-9) && Math.abs(dot(s.heading, s.dir)) < 1e-9 && dot(s.heading, b) > 0 && Math.abs(dot(s.heading, n)) < 1e-9;
  }
  assert(onArc, 'U3b every intermediate position lies on the great circle through the two centres, on the unit sphere');
  assert(prop, 'U3c angle from A grows linearly with t (constant ground speed — not a chord or screen-space lerp)');
  assert(facing && dot(s0.heading, b) > 0 && dot(s1.heading, cross(n, b)) / len(cross(n, b)) > 0.999999, 'U3d facing = unit tangent of the arc towards the target, also at both ends');
  const far = UL.greatCircleStep(a, b, 7), neg = UL.greatCircleStep(a, b, -3), same = UL.greatCircleStep(a, a, 0.5);
  assert(far.dir.every((v, k) => v === b[k]) && neg.dir.every((v, k) => v === a[k]) && near(len(same.heading), 1, 1e-9) && same.dir.every((v, k) => v === a[k]),
    'U3e t is clamped to [0, 1]; a zero-length step keeps a valid facing');
}

// ── U4 rozstawienie ────────────────────────────────────────────────────────────────────
console.log('\nU4 placement on tiles');
if (!UL.unitPlacements) missing(['U4a', 'U4b', 'U4c', 'U4d', 'U4e', 'U4f', 'U4g'], 'ColonyUnitLogic'); else {
  const T = UL.UNIT_VIEW, place = (units, tiles = null, extra = {}) => UL.unitPlacements({ units, topo, tiles, archetypes: UNIT_ARCHETYPES, ...extra });
  const one = place([unit(A)]);
  const it = one.items[0], bs = UL.tangentBasis(C(A));
  assert(one.items.length === 1 && it.dir.every((v, k) => v === C(A)[k]) && it.share === T.modelShare && it.shown && !it.enemy && !it.moving
    && Math.abs(dot(it.heading, it.dir)) < 1e-9 && dot(it.heading, bs.east) > 0.999 && one.stacks.length === 1 && one.stacks[0].own === 1 && !one.stacks[0].contested,
  'U4a a single unit stands on its tile centre, upright, facing local east');
  const left = place([unit(A, { _facingLeft: true })]).items[0];
  assert(dot(left.heading, bs.east) < -0.999, 'U4b _facingLeft (set by stepDirection) turns the model to local west');
  const tiles = grid.tiles.map(() => ({}));
  tiles[A] = { buildingId: 'mine' };
  const onB = place([unit(A)], tiles).items[0], off = Math.acos(Math.min(1, dot(onB.dir, C(A))));
  const site = place([unit(A)], grid.tiles.map((t, i) => (i === A ? { underConstruction: { buildingId: 'farm' } } : {}))).items[0];
  const cap = place([unit(A)], grid.tiles.map((t, i) => (i === A ? { capitalBase: true } : {}))).items[0];
  assert(near(off, Math.atan(T.builtOffset * spacing), 1e-9) && off < 0.5 * spacing && dot(onB.dir, bs.north) < 0 && Math.abs(dot(onB.dir, bs.east)) < 1e-9 && onB.share === T.builtShare && onB.share < T.modelShare
    && dot(site.dir, bs.north) < -0.01 && dot(cap.dir, bs.north) < -0.01 && dot(onB.dir, bs.north) < -0.01,
  'U4c on a tile with a building / site / capital the unit stands south of the centre (in front of the portrait), inside the tile, smaller');
  const st = place([unit(A), unit(A), unit(A), unit(A), unit(A)]);
  const shown = st.items.filter(i => i.shown), east = shown.map(i => dot(i.dir, bs.east));
  assert(st.items.length === 5 && shown.length === T.maxModelsPerSide && st.stacks[0].own === 5 && shown.every(i => i.share === T.stackShare && Math.abs(dot(i.dir, bs.north)) < 1e-9)
    && east[0] < east[1] && east[1] < east[2] && near(east[0] + east[2], 0, 1e-9) && Math.abs(east[1]) < 1e-12,
  `U4d a stack is a row along local east, at most ${T.maxModelsPerSide} models per side; the stack count keeps all 5`);
  const war = place([unit(A), unit(A), foe(A), foe(A, { _stealthState: 'hidden' })]);
  const own = war.items.filter(i => !i.enemy), en = war.items.filter(i => i.enemy);
  assert(war.items.length === 3 && war.stacks[0].contested && war.stacks[0].own === 2 && war.stacks[0].enemy === 1 && own.every(i => dot(i.dir, bs.east) < 0 && dot(i.heading, bs.east) > 0.9)
    && en.every(i => dot(i.dir, bs.east) > 0 && dot(i.heading, bs.east) < -0.9) && UL.battleTilesOf(war).length === 1 && UL.battleTilesOf(one).length === 0
    && en[0].tint.join() === T.enemyTint.join() && own[0].tint.join() === T.ownTint.join(),
  'U4e contested tile: own units on the west side, enemy on the east, facing each other; a hidden enemy is not placed; enemy models are tinted');
  const pb = UL.tangentBasis(C(POLE)), pw = place([unit(POLE), foe(POLE)]), po = pw.items.find(i => !i.enemy), pe = pw.items.find(i => i.enemy);
  assert(POLE >= 0 && dot(po.heading, pb.east) > 0.99 && dot(pe.heading, pb.east) < -0.99 && Math.abs(dot(po.heading, po.dir)) < 1e-9 && dot(po.heading, pe.heading) < -0.98,
    'U4j pole tile: facing comes from the basis of the tile centre (sides still face each other where local east spins)');
  const mv = place([unit(A, { status: 'moving', _path: [{ q: B, r: -1 }], _animT: 0.5 }), unit(A)]);
  const m = mv.items.find(i => i.moving), ref = UL.greatCircleStep(C(A), C(B), 0.5);
  assert(mv.moving === 1 && m && m.dir.every((v, k) => near(v, ref.dir[k], 1e-12)) && m.heading.every((v, k) => near(v, ref.heading[k], 1e-12)) && mv.stacks[0].own === 1 && m.share === T.movingShare
    && place([unit(A, { status: 'moving', _path: [{ q: B, r: -1 }], _animT: 0 })]).items[0].dir.every((v, k) => v === C(A)[k])
    && place([unit(A, { status: 'moving', _path: [{ q: B, r: -1 }], _animT: 1 })]).items[0].dir.every((v, k) => v === C(B)[k]),
  'U4f a marching unit is on the great-circle step (centre → centre), outside the stack it left');
  const none = place([unit(3, { r: 4 }), unit(topo.count + 5), { id: 'x', q: 1.5, r: -1 }]);
  assert(none.items.length === 0 && UL.geoTileOf({ q: 7, r: -1 }) === 7 && UL.geoTileOf({ q: 7, r: 0 }) === -1 && UL.unitPlacements({ units: [unit(A)], topo: null }).items.length === 0,
    'U4g units of a flat grid (r ≠ −1) or off the graph are never placed on the sphere');
  const off2 = place([unit(A, { status: 'offline' }), unit(B, { supply: 0, supplyCap: 100 })]);
  assert(off2.items[0].tint.join() === T.offlineTint.join() && off2.items[1].tint.join() === T.starvingTint.join(), 'U4h offline and starving units are dimmed like the 2D map filters');
  const u = unit(A), now = 10000, lands = new Map([[u.id, now - 200]]);
  const l0 = place([u], null, { landings: lands, now }).items[0], l1 = place([u], null, { landings: lands, now: now + T.landingDropMs }).items[0], l2 = place([u], null, { landings: lands, now: now + T.landingMs + 1 }).items[0];
  assert(l0.height > 0.5 * T.landingHeight * spacing && l0.landing > 0.9 && l1.height === 0 && l1.landing > 0 && l2.height === 0 && l2.landing === 0
    && place([u], null, { landings: lands, now }).landing === 1 && place([u], null, { landings: lands, now: now + T.landingMs + 1 }).landing === 0,
  'U4i landing: the model starts above its tile and comes down; the landing marker fades out and ends');
}

// ── U5 grupy instancji ─────────────────────────────────────────────────────────────────
console.log('\nU5 instancing groups');
if (!UL.groupUnitInstances) missing(['U5a', 'U5b', 'U5c', 'U5d'], 'ColonyUnitLogic'); else {
  const units = [unit(A), unit(B), unit(60), garrison(70, 'mobile'), garrison(71, 'deployed'), garrison(72, 'packing'), foe(80), unit(90, { sprite: null })];
  const pl = UL.unitPlacements({ units, topo, archetypes: UNIT_ARCHETYPES });
  const g = UL.groupUnitInstances(pl.items);
  const marines = g.get('assets/units/ground/humanity/human_marines.glb');
  assert(g.size === 4 && marines?.items.length === 3 && g.get('assets/units/ground/UNE/une_marines.glb')?.items.length === 1, 'U5a one group per model file: three infantry units share one group');
  const gm = [...g.keys()].find(k => /garrison_mobile/.test(k)), gd = [...g.keys()].find(k => /garrison_deployed/.test(k));
  assert(g.get(gm)?.items.length === 1 && g.get(gd)?.items.length === 2 && g.get(gm).candidates.length === 2, 'U5b the deploy variant is part of the key: mobile and deployed garrisons are separate groups');
  const many = UL.unitPlacements({ units: [unit(A), unit(A), unit(A), unit(A), unit(A)], topo });
  assert(UL.groupUnitInstances(many.items).get('assets/units/ground/humanity/human_marines.glb').items.length === UL.UNIT_VIEW.maxModelsPerSide && ![...g.values()].some(x => x.items.some(i => !i.key)),
    'U5c units beyond the per-side limit and units without a model file are not instanced');
  const s1 = UL.unitLayerSignature(g);
  const moved = UL.unitPlacements({ units: [...units.slice(1), unit(A, { status: 'moving', _path: [{ q: B, r: -1 }], _animT: 0.3 })], topo, archetypes: UNIT_ARCHETYPES });
  const s2 = UL.unitLayerSignature(UL.groupUnitInstances(moved.items));
  assert(s1 === UL.unitLayerSignature(UL.groupUnitInstances(UL.unitPlacements({ units, topo, archetypes: UNIT_ARCHETYPES }).items)) && s1 !== s2 && s1.length > 0 && UL.unitLayerSignature(new Map()) === '',
    'U5d layer signature: same frame → same signature (no render), a marching unit changes it');
}

// ── U6 macierz instancji ───────────────────────────────────────────────────────────────
console.log('\nU6 instance matrix');
if (!UL.instanceMatrix) missing(['U6a', 'U6b'], 'ColonyUnitLogic'); else {
  const T = UL.UNIT_VIEW;
  const it = UL.unitPlacements({ units: [unit(A, { status: 'moving', _path: [{ q: B, r: -1 }], _animT: 0.4 })], topo }).items[0];
  const m = UL.instanceMatrix(it, spacing), X = [m[0], m[1], m[2]], Y = [m[4], m[5], m[6]], Z = [m[8], m[9], m[10]], P = [m[12], m[13], m[14]], s = it.share * spacing;
  assert(near(len(X), s, 1e-12) && near(len(Y), s, 1e-12) && near(len(Z), s, 1e-12) && Math.abs(dot(X, Y)) < 1e-12 && Math.abs(dot(Y, Z)) < 1e-12 && Math.abs(dot(X, Z)) < 1e-12 && dot(cross(X, Y), Z) > 0,
    'U6a orthogonal right-handed basis with one scale = share × tile spacing');
  assert(near(dot(Y, it.dir), s, 1e-12) && near(dot(Z, it.heading), s, 1e-9) && near(len(P), 1 + T.lift, 1e-12) && near(dot(P, it.dir), 1 + T.lift, 1e-12) && m[15] === 1 && m[3] === 0,
    'U6b model up = tile normal, model forward = facing, base on the surface (radius 1 + lift)');
  const up = UL.instanceMatrix({ ...it, height: 0.2 }, spacing);
  assert(near(Math.hypot(up[12], up[13], up[14]), 1 + T.lift + 0.2, 1e-12), 'U6c a landing unit is lifted along the tile normal');
}

// ── U7 ColonyUnitModels wykonaniem ───────────────────────────────────────────────────────────
console.log('\nU7 model layer by execution');
const boxScene = (w = 2, h = 4, d = 1, parts = 1) => {
  const g = new THREE.Group();
  for (let i = 0; i < parts; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial()); m.position.set(5 + i * 0.1, 7, -3); m.rotation.z = Math.PI / 2; g.add(m); }
  return g;
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
if (!UM.ColonyUnitModels || !UL.groupUnitInstances) missing(['U7a', 'U7b', 'U7c', 'U7d', 'U7e', 'U7f'], 'ColonyUnitModels'); else {
  UM.clearUnitTemplates();
  const loads = [], have = new Set(['assets/units/ground/humanity/human_marines.glb', 'assets/units/ground/humanity/human_garrison_mobile.glb', 'assets/units/ground/humanity/human_garrison.glb']);
  let changes = 0;
  const load = async (p) => { loads.push(p); if (!have.has(p)) throw new Error('404'); return boxScene(2, 4, 1, p.includes('marines') ? 2 : 1); };
  const layer = new UM.ColonyUnitModels({ THREE, load, onChange: () => { changes++; } });
  const units = [unit(A), unit(B), unit(60), garrison(70, 'mobile'), garrison(71, 'deployed'), foe(80)];
  const groups = UL.groupUnitInstances(UL.unitPlacements({ units, topo, archetypes: UNIT_ARCHETYPES }).items);
  const first = layer.setInstances(groups, spacing);
  assert(first === 0 && [...groups.values()].every(g => layer.stateOf(g.key, g.candidates) === 'loading'), 'U7a first frame: templates are loading, nothing is instanced yet');
  for (let i = 0; i < 6; i++) await tick();
  const K = (re) => [...groups.keys()].find(k => re.test(k));
  assert(layer.stateOf(K(/human_marines/)) === 'ready' && layer.stateOf(K(/garrison_mobile/)) === 'ready' && layer.stateOf(K(/garrison_deployed/)) === 'ready' && layer.stateOf(K(/une_marines/)) === 'missing' && changes >= 4,
    'U7b states: file present → ready; variant file missing → base GLB (fallback); no file at all → missing; the host is asked to redraw');
  const n = layer.setInstances(groups, spacing), info = layer.info();
  assert(n === 5 && info.instances === 5 && info.groups === 3 && info.drawCalls === 4 && layer._meshes.get(K(/human_marines/)).list.length === 2 && layer._meshes.get(K(/human_marines/)).list.every(im => im.isInstancedMesh && im.count === 3),
    'U7c one InstancedMesh per template part and group: 3 infantry units = 1 draw per part (5 units, 3 groups, 4 draws)');
  const tpl = layer._keys.get(K(/human_marines/)).tpl, bb = new THREE.Box3();
  for (const p of tpl.parts) { p.geometry.computeBoundingBox(); bb.union(p.geometry.boundingBox); }
  const sz = bb.getSize(new THREE.Vector3());
  assert(near(bb.min.y, 0, 1e-6) && near(Math.max(sz.x, sz.y, sz.z), 1, 1e-6) && near(bb.min.z + bb.max.z, 0, 1e-6) && near(bb.min.x + bb.max.x, 0, 1e-6) && near(sz.x, 1, 1e-6) && near(sz.y, 2 / 4.1, 1e-6) && tpl.triangles === 24, 'U7d template is normalised: base at y = 0, centred, largest dimension 1 (node transforms baked)');
  const layer2 = new UM.ColonyUnitModels({ THREE, load });
  layer2.stateOf(K(/human_marines/), groups.get(K(/human_marines/)).candidates);
  await tick(); await tick();
  assert(loads.filter(p => p.includes('human_marines')).length === 1 && layer2.stateOf(K(/human_marines/)) === 'ready' && loads.filter(p => p.includes('garrison.glb')).length === 1,
    'U7e template cache: each GLB file is loaded once per session, also across layers and groups');
  const big = UL.groupUnitInstances(UL.unitPlacements({ units: Array.from({ length: 9 }, (_, i) => unit(100 + i)), topo }).items);
  layer.setInstances(big, spacing);
  const e = layer._meshes.get(K(/human_marines/));
  const m0 = new THREE.Matrix4(); e.list[0].getMatrixAt(8, m0);
  assert(e.capacity >= 9 && e.list[0].count === 9 && near(Math.hypot(m0.elements[12], m0.elements[13], m0.elements[14]), 1 + UL.UNIT_VIEW.lift, 1e-6) && layer._meshes.get(K(/garrison_mobile/)).list[0].count === 0
    && layer.info().instances === 9,
  'U7f capacity grows with the group; groups that left the frame draw nothing');
  let rendered = 0;
  const ok = layer.render({ render: () => { rendered++; } }, {}, [0, 0, 1], [1, 0, 0]);
  layer.setInstances(null, spacing);
  const none = layer.render({ render: () => { rendered++; } }, {}, [0, 0, 1], [1, 0, 0]);
  layer.disposeGL();
  assert(ok === true && none === false && rendered === 1 && layer._meshes.size === 0 && layer.info().instances === 0 && layer.stateOf(K(/human_marines/)) === 'ready',
    'U7g render only with instances; disposeGL drops scene objects, templates stay cached');
}

// ── U8 renderer kuli wykonaniem ──────────────────────────────────────────────────────────
console.log('\nU8 sphere renderer by execution');
function fakeCanvas() { const ls = {}, c2d = { clearRect() { c2d.clears++; }, drawImage() { c2d.copies++; }, clears: 0, copies: 0 }; return { width: 2, height: 2, c2d, getContext: () => c2d, addEventListener: (k, f) => { ls[k] = f; }, removeEventListener: (k) => { delete ls[k]; } }; }
function countCtx() {
  const calls = { drawImage: 0, fillText: 0, fillRect: 0, arc: 0, ellipse: 0, stroke: 0 }, texts = [];
  return new Proxy({}, { get: (_, k) => (k === 'getTransform' ? () => ({ a: 1 }) : (k === 'calls' ? calls : (k === 'texts' ? texts : (k === 'measureText' ? () => ({ width: 40 })
    : (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => { if (k in calls) calls[k]++; if (k === 'fillText') texts.push(a[0]); }))))), set: () => true });
}
const mkEnv = () => ({ now: 0, order: [], layers: [], failLayer: false });
const mkRenderer = (env, extra = {}) => new RMOD.ColonySphereRenderer({ THREE, now: () => env.now, getCache: () => null, getWeatherRate: () => 0, createCanvas: fakeCanvas,
  createGL: () => ({ render: (scene) => { env.order.push(scene === env.unitScene ? 'units' : 'sphere'); }, setSize() {}, dispose() {}, forceContextLoss() {}, getContext: () => null }),
  createUnitLayer: (o) => {
    const l = { o, state: 'ready', n: 0, disposed: 0, stateOf: () => l.state, setInstances: (g) => { l.n = g ? [...g.values()].reduce((s, x) => s + x.items.length, 0) : 0; return l.n; },
      render: (gl) => { if (env.failLayer) throw new Error('boom'); if (l.n <= 0) return false; env.unitScene = l; gl.render(l, null); return true; }, disposeGL: () => { l.disposed++; }, info: () => ({ instances: l.n, groups: 1, drawCalls: 1, triangles: 0, states: {} }) };
    env.layers.push(l); return l;
  }, ...extra });
const rect = { x: 0, y: 0, w: 800, h: 600 };
if (!RMOD?.ColonySphereRenderer?.prototype?.setUnits || !UL.groupUnitInstances) missing(['U8a', 'U8b', 'U8c', 'U8d', 'U8e'], 'ColonySphereRenderer.setUnits'); else {
  const env = mkEnv(), r = mkRenderer(env), ctx = countCtx();
  r.setBody({ body: terranBody(), n: grid.n, star: {}, capitalTile: A });
  const groups = (units) => UL.groupUnitInstances(UL.unitPlacements({ units, topo, archetypes: UNIT_ARCHETYPES }).items);
  r.draw(ctx, rect); env.now += 16;
  const base = env.order.length;
  r.draw(ctx, rect); env.now += 16;
  assert(base >= 1 && env.order.every(x => x === 'sphere') && r.drawUnits(ctx, rect) === false && r.info().units.passes === 0 && env.layers.length === 0, 'U8a no units → no model pass, no layer object, nothing composited');
  const g1 = groups([unit(A), unit(B)]);
  assert(r.unitModelState([...g1.keys()][0], [...g1.values()][0].candidates) === 'ready' && env.layers.length === 1 && r.unitModelsAvailable() === true, 'U8b the layer is created on the first model question');
  r.setUnits(g1);
  const before = env.order.length;
  r.draw(ctx, rect); env.now += 16;
  const seq = env.order.slice(before), d0 = ctx.calls.drawImage;
  assert(seq.join() === 'units,sphere' && r.info().units.passes === 1 && r.drawUnits(ctx, rect) === true && ctx.calls.drawImage === d0 + 1 && r._unitCanvas.c2d.copies === 1 && r._unitCanvas.c2d.clears === 1,
    'U8c units changed → one frame: model pass FIRST (copied to its own layer canvas), sphere second (the GL canvas ends with the sphere); the layer is composited on request');
  const n1 = env.order.length;
  r.setUnits(groups([unit(A), unit(B)]));
  r._spin.factor = 0; r._hover = { on: true, tile: 1, dir: null };
  const rendersBefore = r.info().renders;
  r.draw(ctx, rect); env.now += 16;
  const same = r.info().renders === rendersBefore || env.order.slice(n1).length <= 2;
  r.setUnits(groups([unit(A), unit(B, { status: 'moving', _path: [{ q: topo.neighbors(B)[0], r: -1 }], _animT: 0.4 })]));
  assert(same && r._dirty === true, 'U8d same units → signature unchanged; a marching unit marks the frame dirty (render on demand stays)');
  env.failLayer = true;
  const n2 = env.order.length;
  const res = r.draw(ctx, rect); env.now += 16;
  assert(res.fallback === false && env.order.slice(n2).join() === 'sphere' && r.info().units.failed === true && r.unitModelsAvailable() === false && r.drawUnits(ctx, rect) === false
    && r.unitModelState('x', ['x']) === 'missing' && r.fallback().fallback === false,
  'U8e a failing model layer switches itself off (markers take over); the sphere keeps rendering in WebGL');
  r.release();
  assert(env.layers[0].disposed === 1 && r.info().units.failed === false && r._unitCanvas === null, 'U8f release() frees the layer with the GL context and re-arms it');
  const p = r.projectDirection(...C(A), rect), p2 = r.projectDirection(...C(A), rect, 1.1);
  const SLm = await import('../../renderer/ColonySphereLogic.js'), q = C(topo.neighbors(A)[1]), pr = SLm.projectDir(r.view, rect.w / rect.h, q[0], q[1], q[2], 1, r.tuning);
  const pq = r.projectDirection(...q, rect), pq2 = r.projectDirection(...q, rect, 1.1), dc = r.discOnScreen(rect);
  assert(Number.isFinite(p2.x) && near(pq.x, rect.x + (pr.nx + 1) * 0.5 * rect.w, 1e-9) && near(pq.y, rect.y + (1 - pr.ny) * 0.5 * rect.h, 1e-9) && r.projectDirection(...C(A), rect, 1).x === p.x
    && Math.hypot(pq2.x - dc.x, pq2.y - dc.y) > Math.hypot(pq.x - dc.x, pq.y - dc.y) + 1, 'U8g projectDirection takes a radius (HUD above the model), default unchanged');
}

// ── U9 widok wykonaniem ────────────────────────────────────────────────────────────────
console.log('\nU9 unit view by execution');
if (!UV.ColonySphereUnits || !RMOD?.ColonySphereRenderer?.prototype?.setUnits) missing(['U9a', 'U9b', 'U9c', 'U9d', 'U9e', 'U9f'], 'ColonySphereUnits'); else {
  const env = mkEnv(), r = mkRenderer(env), ctx = countCtx();
  r.setBody({ body: terranBody(), n: grid.n, star: {}, capitalTile: A });
  r.draw(ctx, rect);
  let clock = 5000;
  const uv = new UV.ColonySphereUnits({ renderer: r, now: () => clock });
  const nb = topo.neighbors(A);
  const army = [unit(A), unit(A), unit(A), unit(nb[0]), foe(nb[1]), garrison(nb[2], 'deployed')];
  const tilePx = r.tileScreenSize(rect);
  const sync = (units, extra = {}) => uv.sync({ units, grid, archetypes: UNIT_ARCHETYPES, ...extra }, rect);
  uv.lodBias = UL.UNIT_LOD_BIAS.MARKERS; sync(army);
  let c = countCtx(); uv.draw(c, rect);
  const far = uv.info();
  assert(far.lod === 'marker' && far.models === 0 && far.markers === 4 && r._unitGroups === null && c.texts.includes('3') && c.calls.arc >= 8 && c.calls.drawImage === 0,
    'U9a far: one compact marker per tile and side, the stack shows its count (3), no model instances');
  uv.lodBias = UL.UNIT_LOD_BIAS.MODELS; sync(army);
  c = countCtx(); uv.draw(c, rect);
  const nr = uv.info();
  assert(nr.lod === 'model' && nr.models === 6 && nr.markers === 0 && r._unitGroups?.size === 3 && c.texts.includes('3'), 'U9b near: every unit is a model instance (3 groups), the stack keeps its count badge');
  env.layers[0].state = 'missing'; sync(army);
  assert(uv.info().models === 0 && uv.info().markers === 4 && r._unitGroups === null, 'U9c model file missing / not loaded yet → the unit falls back to the compact marker');
  env.layers[0].state = 'ready';
  uv.lodBias = UL.UNIT_LOD_BIAS.AUTO; sync(army);
  assert(uv.info().lod === UL.unitLodOf(tilePx) && uv.cycleLod() === 'models' && uv.cycleLod() === 'markers' && uv.cycleLod() === 'auto', 'U9d auto LOD follows the on-screen tile size; csUnitLod cycles auto → models → markers');
  uv.lodBias = UL.UNIT_LOD_BIAS.MODELS;
  sync(army);
  assert(uv.nextFrameDelayMs() === Infinity, 'U9e standing units ask for no frames (render on demand)');
  const marching = [...army, unit(nb[3], { status: 'moving', _path: [{ q: nb[4], r: -1 }], _animT: 0.5 })];
  sync(marching);
  const dMove = uv.nextFrameDelayMs();
  sync(marching, { paused: true });
  assert(near(dMove, 1000 / UL.UNIT_VIEW.moveFps, 1e-9) && uv.nextFrameDelayMs() === Infinity, 'U9f a marching unit paces frames at the march rate; paused game → none');
  const fight = [...army, foe(A)];
  sync(fight);   // Finding 797 (CS-10b): wspólne pole bez bitwy w systemie walki (pokój / brak predykatu) — bez znacznika
  c = countCtx(); uv.draw(c, rect);
  const peaceBattles = uv.info().battles;
  sync(fight, { battleAt: () => true });
  c = countCtx(); uv.draw(c, rect);
  assert(peaceBattles === 0 && uv.info().battles === 1 && near(uv.nextFrameDelayMs(), 1000 / UL.UNIT_VIEW.effectFps, 1e-9) && c.texts.includes('3') && c.texts.includes('1'), 'U9g contested tile: battle marker (only when the combat system fights there, Finding 797), both side counts, effect frame rate');
  const lander = foe(nb[5]);
  uv.noteLanding([lander.id]);
  sync([lander]);
  const l0 = uv.info().landing, h0 = uv._frame.placement.items[0].height;
  clock += UL.UNIT_VIEW.landingMs + 10; sync([lander]);
  assert(l0 === 1 && h0 > 0 && uv.info().landing === 0 && uv._landings.size === 0 && uv._frame.placement.items[0].height === 0, 'U9h landing: noted units come down and the effect expires (no leak)');
  const sel = [unit(A, { hp: 4, hpMax: 10 })];
  sync(sel, { selectedId: sel[0].id });
  c = countCtx(); uv.draw(c, rect);
  assert(c.calls.ellipse >= 1 && c.calls.fillRect >= 2 && UL.unitBarsOf(sel[0]).length === 1 && UL.unitBarsOf(sel[0])[0].color === UL.UNIT_COLORS.hpMid && UL.unitBarsOf(unit(A)).length === 0
    && UL.unitBarsOf(unit(A, { supply: 30, supplyCap: 100, org: 5, maxOrg: 10, morale: 10, maxMorale: 10 })).map(b => b.color).join() === [UL.UNIT_COLORS.supplyMid, UL.UNIT_COLORS.org].join(),
  'U9i HUD: selection ring, HP bar only when damaged, supply / org / morale bars with the 2D map colours and conditions');
  if (VIEW.ColonySphereView) {
    const view = new VIEW.ColonySphereView({ createRenderer: () => mkRenderer(mkEnv()), createCanvas: () => fakeCanvas() });
    assert(view.units instanceof UV.ColonySphereUnits && view.units.renderer === view.renderer && typeof view.syncUnits === 'function' && typeof view.drawUnits === 'function', 'U9j ColonySphereView owns the unit view on its renderer');
  } else assert(false, 'U9j ColonySphereView missing');
}

// ── U10 budżet GLB ─────────────────────────────────────────────────────────────────────
console.log('\nU10 GLB size budget');
if (!UL.UNIT_GLB_BUDGET) missing(['U10a', 'U10b'], 'UNIT_GLB_BUDGET'); else {
  const dir = path.join(ROOT, 'assets/units/ground');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (e.name.startsWith('_') ? [] : walk(path.join(d, e.name))) : (/\.glb$/i.test(e.name) ? [path.join(d, e.name)] : [])));
  const glbTriangles = (file) => {
    const fd = openSync(file, 'r'), head = Buffer.alloc(20);
    readSync(fd, head, 0, 20, 0);
    const n = head.readUInt32LE(12), json = Buffer.alloc(n);
    readSync(fd, json, 0, n, 20); closeSync(fd);
    const g = JSON.parse(json.toString('utf8'));
    let t = 0;
    for (const m of g.meshes ?? []) for (const p of m.primitives ?? []) t += (g.accessors[p.indices ?? p.attributes.POSITION].count) / 3;
    return { triangles: Math.round(t), ext: g.extensionsRequired ?? [] };
  };
  const files = walk(dir), Bg = UL.UNIT_GLB_BUDGET;
  const rows = files.map(f => ({ f: path.relative(dir, f).replace(/\\/g, '/'), bytes: statSync(f).size, ...glbTriangles(f) }));
  const over = rows.filter(x => x.bytes > Bg.maxBytes || x.triangles > Bg.maxTriangles);
  assert(files.length >= 21 && over.length === 0, `U10a every unit GLB in the game path fits the budget (${(Bg.maxBytes / 1048576).toFixed(1)} MB, ${Bg.maxTriangles} triangles) — ${rows.length} files, largest ${(Math.max(...rows.map(x => x.bytes)) / 1048576).toFixed(2)} MB${over.length ? ', over: ' + over.map(x => x.f).join(', ') : ''}`);
  assert(rows.every(x => !x.ext.some(e => /draco|meshopt|basisu/i.test(e))), 'U10b no Draco / meshopt / KTX2 in unit GLBs (the game loader has no decoders)');
  const gi = src('.gitignore'), tool = src('tools/unit-models/optimize-unit.mjs');
  assert(/^\/assets\/units\/ground\/_originals\/$/m.test(gi) && /if \(e\.name\.startsWith\('_'\)\) continue;/.test(tool) && /UNIT_GLB_BUDGET/.test(tool) && !existsSync(path.join(dir, 'humanity/_originals')),
    'U10c originals live in assets/units/ground/_originals (git-ignored, skipped by the tool and by this budget)');
}

// ── U11 okablowanie ────────────────────────────────────────────────────────────────────
console.log('\nU11 wiring and flat path');
{
  const co = stripComments(src('src/ui/ColonyOverlay.js'));
  const dsm = body(co, '  _drawSphereMap(ctx, ox, oy, ow, oh, grid, colony) {');
  const iSync = dsm.indexOf('sv.syncUnits('), iDraw = dsm.indexOf('sv.draw(ctx, rect)'), iUnits = dsm.indexOf('sv.drawUnits(ctx, rect)'), iChrome = dsm.indexOf('sv.drawChrome(ctx, rect)');
  assert(iSync > 0 && iSync < iDraw && iDraw < iUnits && iUnits < iChrome, 'U11a sphere map order: unit state → sphere + portraits → units → frame');
  assert(/units: gum && colony \? visibleGroundUnits\(window\.KOSMOS, gum\.getUnitsOnPlanet\(colony\.planetId\)\) : \[\]/.test(dsm) && !/_drawUnits\(/.test(dsm) && !/gridAdapter/.test(dsm),
    'U11b the sphere draws only units passed by the player-visibility rule (Finding 379); no screen-space path left on geo colonies');
  const dm = body(co, '  _drawMap(ctx, ox, oy, ow, oh, grid, planet) {');
  const du = body(co, '  _drawUnits(ctx, ox, oy, ow, oh, grid) {');
  assert(/this\._drawUnits\(ctx, ox, oy, ow, oh, grid\);/.test(co) && du.length > 3000 && /sx = cx \+ fromPos\.x \+ \(toPos\.x - fromPos\.x\) \* unit\._animT;/.test(du) && !/ColonyUnit|syncUnits|sv\.drawUnits/.test(du) && !/syncUnits|ColonyUnit/.test(dm),
    'U11c flat colonies: the 2D map still draws units with today\'s _drawUnits, untouched');
  assert(/EventBus\.on\('invasion:troopsLanded', \(\{ planetId, unitIds \}\) => \{\s*const grid = window\.KOSMOS\?\.colonyManager\?\.getColony\?\.\(planetId\)\?\.grid;\s*if \(grid\?\.kind !== 'geo' \|\| !unitIds\?\.length\) return;\s*this\._sphereOf\(\)\.units\.noteLanding\(unitIds\);/.test(co),
    'U11d invasion landing feeds the sphere only for a geo colony (flat colonies: nothing happens)');
  const dbg = src('src/debug/ColonyUnitsDebug.js'), gs = src('src/scenes/GameScene.js'), sd = src('src/debug/ColonySphereDebug.js');
  assert(/export function colonyUnitsDebugHelpers\(\) \{ return \{ csUnits, csUnitMove, csUnitLanding, csUnitBattle, csUnitLod, csUnitInfo, csUnitsClear \}; \}/.test(dbg)
    && /for \(const k of \['csUnits', 'csUnitMove', 'csUnitLanding', 'csUnitBattle', 'csUnitLod', 'csUnitInfo', 'csUnitsClear'\]\) window\[k\]/.test(gs) && /\.\.\.colonyUnitsDebugHelpers\(\)/.test(sd)
    && /grid\?\.kind === 'geo'/.test(dbg) && /isLandingEdge\(t\)/.test(dbg),
  'U11e owner helpers registered (csUnits, csUnitMove, csUnitLanding, csUnitBattle, csUnitLod, csUnitInfo, csUnitsClear); geo colonies only; landing uses the landing-zone rule');
  const sysDir = path.join(ROOT, 'src/systems');
  const leaks = readdirSync(sysDir).filter(f => /\.js$/.test(f) && /ColonyUnitLogic|ColonyUnitModels|ColonySphereUnits/.test(readFileSync(path.join(sysDir, f), 'utf8')));
  const logic = stripComments(src('src/renderer/ColonyUnitLogic.js'));
  assert(leaks.length === 0 && logic.length > 2000 && !/\bimport\b/.test(logic) && !/window\.|document\.|Math\.random|Date\.now/.test(logic), 'U11f no game system imports the unit view; the logic module is pure (no imports, no DOM, no randomness)');
  const g = tileGraphOf(grid), st = g.stepDirection({ q: A, r: -1 }, { q: B, r: -1 });
  if (UL.tangentBasis) {
    const e = UL.tangentBasis(C(A)).east, d = [C(B)[0] - C(A)[0], C(B)[1] - C(A)[1], C(B)[2] - C(A)[2]];
    assert(st.crossesSeam === false && st.facingLeft === (dot(d, e) < 0), 'U11g local east of the unit view = the east of TileGraph.stepDirection (facingLeft means the same on the sphere)');
  } else assert(false, 'U11g tangentBasis missing');
}

// ── U12 offline: mapa otoczenia z lokalnej kopii (build Steam bez sieci) ─────────────────
console.log('\nU12 offline environment map');
{
  const um = stripComments(src('src/renderer/ColonyUnitModels.js'));
  const env = src('src/lib/addons/RoomEnvironment.js'), envCode = stripComments(env);
  const imports = [...envCode.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  assert(/await import\('\.\.\/lib\/addons\/RoomEnvironment\.js'\)/.test(um) && !/addons\/environments/.test(um) && !/https?:\/\//.test(um),
    'U12a the sphere unit renderer loads RoomEnvironment from src/lib/addons (no addons CDN path, no URL in ColonyUnitModels)');
  assert(/class RoomEnvironment extends Scene/.test(envCode) && /export \{ RoomEnvironment \}/.test(envCode) && imports.length === 1 && imports[0] === 'three' && !/https?:\/\//.test(envCode)
    && /three@0\.171/.test(env) && /REVISION = '171'/.test(src('src/lib/three.core.js')),
    'U12b vendored RoomEnvironment: r171 like the local three, imports only "three" (import map → src/lib), no URL inside');
  let pkg = {}; try { pkg = JSON.parse(src('package.json')); } catch { /* brak */ }
  const tool = stripComments(src('tools/unit-models/optimize-unit.mjs'));
  assert(/^\^?1\./.test(pkg.devDependencies?.meshoptimizer ?? '') && !pkg.dependencies?.meshoptimizer && /: \['meshoptimizer'\];/.test(tool),
    'U12c meshoptimizer is a devDependency (not shipped with the game) and the GLB tool uses it by default (--meshopt only overrides)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
