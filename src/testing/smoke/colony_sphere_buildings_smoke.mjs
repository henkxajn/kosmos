// ARC COLONY SPHERE CS-9 — keeper budynków-portretów na kuli kolonii, świateł miast i ikon mapy układu (plan §3.18).
//
//   B1  specyfikacja znacznika per stan: zbudowany / budowa / rozbudowa / uszkodzony / poziom (pipsy) / stolica + plakietka
//   B2  LOD i horyzont: płynna skala z klamrami min / max, daleko → kropka kategorii, za horyzontem → nic, kolejność malarska
//   B3  atlas: PNG ≥ 128 px (128 / 256 / 500 / 512 / 1024) → mipmapy, stany wypalone raz, brak PNG → znak kategorii,
//       portret doładowany później zastępuje znak; błąd malowania nie rzuca
//   B4  widok WYKONANIEM (prawdziwy renderer na three r171, atrapa GL): cień + portret na budynek, kropki z daleka,
//       stolica zawsze, pierścień postępu, pipsy, pomiar przebiegu
//   B5  barwa kategorii: domyślnie cienki obrys pola, A/B `full` = podbarwione pole; stolica bez zmian
//   B6  funkcja natężenia świateł: deterministyczna, rośnie z budynkami / ludnością / poziomem, puste pole = 0, klamra 1
//   B7  mapa świateł: tylko komórki świecących pól, środek jaśniejszy od krawędzi, lustro uv, te same bajty przy powtórce
//   B8  shader i kula: maska nocy z uSunPos, mieszanie addytywne, wariant głębi logarytmicznej, powłoka powstaje z mapą
//   B9  Finding 784: kierunek pola geo dla ikon mapy układu; ścieżka płaska nietknięta
//   B10 mapa układu WYKONANIEM: powłoka tylko dla kolonii geo, mapa tylko przy zmianie, znika z kolonią / ciałem
//   B11 flaga OFF / siatka płaska: nic; piny źródła
//
// Importy nowych modułów dynamiczne — na bazie (przed CS-9) piny degradują do FAIL, nie przerywają.

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const missing = (names, what) => { for (const n of names) assert(false, `${n} ${what} missing`); };

const BL = (await tryImport('../../renderer/ColonyBillboardLogic.js')) ?? {};
const AT = (await tryImport('../../renderer/ColonyBillboardAtlas.js')) ?? {};
const CLL = (await tryImport('../../renderer/CityLightsLogic.js')) ?? {};
const CLS = (await tryImport('../../renderer/CityLightsShader.js')) ?? {};
const CCL = (await tryImport('../../renderer/ColonyCityLights.js')) ?? {};
const VIEW = (await tryImport('../../ui/ColonySphereView.js')) ?? {};
const OL = (await tryImport('../../ui/ColonySphereOverlayLogic.js')) ?? {};
const RMOD = await tryImport('../../renderer/ColonySphereRenderer.js');
const { generateGeoGrid } = await import('../../map/GeoColonyGridGenerator.js');
const { geodesicTopology } = await import('../../map/GeodesicTopology.js');
const { PlanetMapGenerator } = await import('../../map/PlanetMapGenerator.js');
const { TERRAIN_TYPES } = await import('../../map/HexTile.js');
const { BUILDINGS } = await import('../../data/BuildingsData.js');
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);

const terranBody = (extra = {}) => ({ id: 'p_terran', type: 'planet', bodyArchetype: 'terran', surfaceSeed: 0xC57B, systemId: 'sys_home', atmosphere: 'breathable',
  waterCoverage: 0.6, temperatureC: 15, surface: { hasWater: true }, name: 'Terra', deposits: [], ...extra });

// ── B1 specyfikacja znacznika ─────────────────────────────────────────────────────────
console.log('\nB1 marker spec per state');
if (!BL.billboardSpecOf) missing(['B1a', 'B1b', 'B1c', 'B1d', 'B1e'], 'ColonyBillboardLogic'); else {
  const S = BL.BILLBOARD_STATE, spec = BL.billboardSpecOf;
  const built = spec({ buildingId: 'mine', buildingLevel: 1 }), site = spec({ underConstruction: { buildingId: 'farm', progress: 0.4 } });
  const up = spec({ buildingId: 'mine', buildingLevel: 2, underConstruction: { buildingId: 'mine', progress: 0.25, isUpgrade: true } });
  const dmg = spec({ buildingId: 'mine', buildingLevel: 3, damaged: true }), dmgUp = spec({ buildingId: 'mine', damaged: true, underConstruction: { buildingId: 'mine', progress: 0.5 } });
  assert(built?.state === S.BUILT && built.portraitId === 'mine' && built.category === BUILDINGS.mine.category && built.progress === null && built.scale === 1 && !built.capital
    && site?.state === S.CONSTRUCTION && site.portraitId === 'farm' && site.category === BUILDINGS.farm.category && Math.abs(site.progress - 0.4) < 1e-9
    && spec({ type: 'plains' }) === null && spec(null) === null && spec({ damaged: true }) === null,
    'B1a built tile → its own portrait; construction site → the portrait of what is being built + progress; empty / damaged empty tile → no marker');
  assert(up?.state === S.UPGRADE && up.portraitId === 'mine' && Math.abs(up.progress - 0.25) < 1e-9 && up.level === 2
    && dmg?.state === S.DAMAGED && dmg.progress === null && dmgUp?.state === S.DAMAGED && dmgUp.progress === 0.5
    && spec({ underConstruction: { buildingId: 'farm', progress: 7 } }).progress === 1 && spec({ underConstruction: { buildingId: 'farm', progress: -1 } }).progress === 0,
    'B1b upgrade in progress keeps the built portrait and carries progress; damaged wins over upgrade (progress kept); progress clamped to 0…1');
  const pips = [1, 2, 3, 5, 6, 8, 10, 14].map(l => BL.pipsOf(l));
  assert(pips[0].count === 0 && pips[1].count === 2 && pips[2].count === 3 && pips[3].count === 5 && pips[3].strong === 0 && pips[4].count === 5 && pips[4].strong === 1
    && pips[5].strong === 3 && pips[6].strong === 5 && pips[7].count === 5 && pips[7].strong === 5 && spec({ buildingId: 'mine', buildingLevel: 3 }).pips.count === 3
    && BL.pipsOf(undefined).count === 0 && site.pips.count === 0,
    'B1c level pips: none at level 1, one pip per level up to 5, levels 6…10 turn pips strong; a construction site has none');
  const cap = spec({ capitalBase: true, buildingId: null }), capFarm = spec({ capitalBase: true, buildingId: 'farm', buildingLevel: 4 });
  assert(cap?.capital && cap.portraitId === 'colony_base' && cap.portraitId === BL.CAPITAL_BUILDING_ID && cap.badgeId === null && cap.scale > 1.3 && cap.pips.count === 0
    && capFarm.portraitId === 'colony_base' && capFarm.badgeId === 'farm' && capFarm.pips.count === 0 && spec({ capitalBase: true, damaged: true }).state === S.DAMAGED,
    'B1d capital: colony_base portrait (not buildingId), larger, the building on the capital tile is a badge, no pips');
  const noPng = spec({ buildingId: '__unknown__' });
  assert(noPng?.category === 'civil' && BL.categoryCss('mining').startsWith('#') && BL.categoryCss('__none__').startsWith('#') && BL.categoryCss('mining') !== BL.categoryCss('energy'),
    'B1e category of the marker comes from the building data (unknown id → civil); category colour is a CSS colour with a fallback');
}

// ── B2 LOD i horyzont ─────────────────────────────────────────────────────────────────
console.log('\nB2 LOD and horizon culling');
if (!BL.billboardLod) missing(['B2a', 'B2b', 'B2c', 'B2d'], 'ColonyBillboardLogic'); else {
  const T = BL.BILLBOARD, lod = BL.billboardLod;
  const sizes = []; let mono = true, prev = 0;
  for (let px = 1; px <= 400; px += 0.5) { const s = lod(px).sizePx; sizes.push(s); if (s < prev - 1e-9) mono = false; prev = s; }
  let jump = 0; for (let i = 1; i < sizes.length; i++) jump = Math.max(jump, sizes[i] - sizes[i - 1]);
  assert(mono && Math.min(...sizes) === T.minPx && Math.max(...sizes) === T.maxPx && jump <= 0.5 * T.sizePerTile + 1e-9 && Math.abs(lod(60).sizePx - 60 * T.sizePerTile) < 1e-9,
    `B2a portrait size grows smoothly with zoom (no step > ${(0.5 * T.sizePerTile).toFixed(2)} px per 0.5 px of tile), clamped to ${T.minPx}…${T.maxPx} px`);
  const far = lod(T.dotBelowPx - 1), mid = lod(T.dotBelowPx + T.dotBandPx / 2), near = lod(T.dotBelowPx + T.dotBandPx + 1);
  assert(far.mode === 'dot' && far.portraitAlpha === 0 && far.dotAlpha === 1 && far.dotPx >= T.dotMinPx && far.dotPx <= T.dotMaxPx
    && mid.mode === 'portrait' && mid.portraitAlpha > 0 && mid.portraitAlpha < 1 && Math.abs(mid.portraitAlpha + mid.dotAlpha - 1) < 1e-9
    && near.portraitAlpha === 1 && near.dotAlpha === 0 && lod(0).mode === 'none' && lod(-3).mode === 'none' && lod(NaN).mode === 'none',
    'B2b far away → category dot only; a crossfade band; near → portrait only; no size → nothing');
  const h = BL.horizonAlpha;
  assert(h(1, true) === 1 && h(T.facingFull, true) === 1 && h(T.facingMin, true) === 0 && h(0.02, true) === 0 && h(-0.5, true) === 0 && h(0.9, false) === 0
    && h((T.facingMin + T.facingFull) / 2, true) > 0 && h((T.facingMin + T.facingFull) / 2, true) < 1,
    'B2c horizon: a tile behind the sphere or at the limb draws nothing, a band fades in, facing tiles are opaque');
  const tiles = [{ buildingId: 'mine' }, { type: 'plains' }, { capitalBase: true }, { buildingId: 'farm' }, { buildingId: 'well' }, { underConstruction: { buildingId: 'farm', progress: 0.5 } }, { buildingId: 'habitat' }];
  const proj = [{ x: 10, y: 80, visible: true, facing: 0.9 }, { x: 0, y: 0, visible: true, facing: 1 }, { x: 50, y: 20, visible: true, facing: 1 }, { x: 30, y: 40, visible: false, facing: 0.9 },
    { x: 70, y: 60, visible: true, facing: 0.05 }, { x: 90, y: 30, visible: true, facing: 0.8 }, null];
  const list = BL.buildBillboardList({ tiles, project: (i) => proj[i], tilePx: 60 });
  const farList = BL.buildBillboardList({ tiles, project: (i) => proj[i], tilePx: 6 });
  assert(list.map(i => i.tile).join() === '5,0,2' && list[2].spec.capital && list.every(i => i.mode === 'portrait' && i.alpha > 0)
    && list[1].size < 60 * T.sizePerTile && list[2].size > list[1].size
    && farList.map(i => `${i.tile}${i.mode[0]}`).join() === '5d,0d,2p' && farList[2].size >= T.capitalMinPx && farList[2].portraitAlpha === 1 && farList[0].portraitAlpha === 0
    && BL.buildBillboardList({ tiles, project: (i) => proj[i], tilePx: 60, lodBias: 0.1 }).map(i => `${i.tile}${i.mode[0]}`).join() === '5d,0d,2p',
    'B2d draw list: only marked, projected, front-facing tiles; painter order (higher on screen first), capital last; foreshortened at the limb; far away → dots, the capital stays a portrait');
}

// ── B3 atlas ──────────────────────────────────────────────────────────────────────────
console.log('\nB3 portrait atlas');
function recCtx(log) {
  const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '' };
  return new Proxy(state, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => { log.push([k, ...a, t.globalCompositeOperation]); })), set: (t, k, v) => { t[k] = v; if (k === 'globalCompositeOperation') log.push(['gco', v]); return true; } });
}
function recCanvas(made) { return (w, h) => { const log = []; const c = { width: w, height: h, log, getContext: () => (c._ctx ??= recCtx(log)) }; made.push(c); return c; }; }
if (!AT.ColonyBillboardAtlas || !BL.topMipFor) missing(['B3a', 'B3b', 'B3c', 'B3d', 'B3e'], 'ColonyBillboardAtlas'); else {
  const S = BL.BILLBOARD_STATE;
  assert([64, 128, 200, 256, 500, 512, 1024, 4096].map(n => BL.topMipFor(n)).join() === '64,128,256,256,512,512,512,512'
    && [10, 32, 33, 64, 100, 128, 300, 900].map(px => BL.mipFor(px, 512)).join() === '32,32,64,64,128,128,512,512' && BL.mipFor(300, 128) === 128 && BL.mipFor(40, 128) === 64,
    'B3a mip choice: top level = source size rounded up to 128 / 256 / 512 (larger art → 512); a frame takes the smallest level ≥ the on-screen size, never above the top');
  const made = [];
  const atlas = new AT.ColonyBillboardAtlas({ createCanvas: recCanvas(made) });
  const img128 = { width: 128, height: 128 }, img500 = { naturalWidth: 500, naturalHeight: 500 }, img512 = { width: 512, height: 512 };
  const a = atlas.portrait('mine', S.BUILT, 'mining', img128, 40), a2 = atlas.portrait('mine', S.BUILT, 'mining', img128, 120), a3 = atlas.portrait('mine', S.BUILT, 'mining', img128, 900);
  const b = atlas.portrait('free_market', S.BUILT, 'market', img500, 300), c = atlas.portrait('x512', S.BUILT, 'civil', img512, 500), c2 = atlas.portrait('x512', S.BUILT, 'civil', img512, 20);
  const builds0 = atlas.builds;
  const again = atlas.portrait('mine', S.BUILT, 'mining', img128, 40);
  assert(a.s === 64 && a2.s === 128 && a3.s === 128 && b.s === 512 && c.s === 512 && c2.s === 32 && again === a && atlas.builds === builds0 && builds0 === 3
    && a.canvas !== a2.canvas && atlas.portrait('well', S.BUILT, 'food', img128, 40).canvas === a.canvas,
    'B3b any square PNG ≥ 128 px works (128 / 500 / 512): each portrait is built once into a mip chain; the same level of different buildings shares one atlas page (one batch)');
  const before = atlas.builds;
  const cons = atlas.portrait('mine', S.CONSTRUCTION, 'mining', img128, 100), dmg = atlas.portrait('mine', S.DAMAGED, 'mining', img128, 100), upg = atlas.portrait('mine', S.UPGRADE, 'mining', img128, 100);
  const scratch = made.find(m => m.width === 128 && m.log.some(e => e[0] === 'gco' && e[1] === 'saturation'));
  const ops = (scratch?.log ?? []).filter(e => e[0] === 'gco').map(e => e[1]);
  assert(atlas.builds === before + 2 && upg === a2 && cons !== a2 && dmg !== a2 && cons !== dmg && ops.includes('saturation') && ops.includes('destination-in') && ops.includes('source-atop'),
    'B3c states are baked into the atlas once: construction = desaturated (saturation blend masked back to the art), damaged = red over the art only; upgrade reuses the built portrait');
  const g = atlas.portrait('lab', S.BUILT, 'research', null, 60), g2 = atlas.portrait('other_lab', S.BUILT, 'research', null, 60), gDmg = atlas.portrait('lab', S.DAMAGED, 'research', null, 60);
  const later = atlas.portrait('lab', S.BUILT, 'research', img128, 60), broken = atlas.portrait('lab2', S.BUILT, 'research', { width: 0 }, 60);
  assert(!!g && g === g2 && gDmg !== g && later !== g && later.s === 64 && broken === g && atlas.stats().errors === 0,
    'B3d no PNG → the category glyph (one sprite per category and state); art that arrives later replaces the glyph without any code; an unloaded image counts as no PNG');
  const bad = new AT.ColonyBillboardAtlas({ createCanvas: () => ({ width: 1, height: 1, getContext: () => new Proxy({}, { get: (_, k) => () => { if (k === 'drawImage') throw new Error('tainted'); }, set: () => true }) }) });
  let threw = false, res = 'x';
  try { res = bad.portrait('mine', S.BUILT, 'mining', img128, 60); bad.portrait('mine', S.BUILT, 'mining', img128, 60); } catch (e) { threw = true; }
  assert(!threw && res === null && bad.stats().errors === 1 && AT.nativeSizeOf({ naturalWidth: 256, naturalHeight: 256 }) === 256 && AT.nativeSizeOf(null) === 0,
    'B3e a portrait that cannot be painted never throws into the UI loop (one recorded error, frame goes on without it)');
}

// ── B4 widok wykonaniem ───────────────────────────────────────────────────────────────
console.log('\nB4 view by execution');
function fakeCanvas() { const ls = {}; return { width: 2, height: 2, addEventListener: (k, f) => { ls[k] = f; }, removeEventListener: (k) => { delete ls[k]; } }; }
function countCtx() {
  const calls = { drawImage: 0, fillText: 0, fillRect: 0, arc: 0, ellipse: 0 }, images = [], arcs = [];
  return new Proxy({}, { get: (_, k) => (k === 'getTransform' ? () => ({ a: 1 }) : (k === 'calls' ? calls : (k === 'images' ? images : (k === 'arcs' ? arcs : (k === 'measureText' ? () => ({ width: 40 })
    : (...a) => { if (k in calls) calls[k]++; if (k === 'drawImage') images.push(a); if (k === 'arc') arcs.push(a); }))))), set: () => true });
}
let viewEnv = null;
if (!VIEW.ColonySphereView || !RMOD || !BL.BILLBOARD) missing(['B4a', 'B4b', 'B4c', 'B4d'], 'ColonySphereView'); else {
  const env = { now: 0, renders: 0, made: [] };
  const mkRenderer = (opts) => {
    const r = new RMOD.ColonySphereRenderer({ ...opts, THREE, now: () => env.now, getCache: () => null, getWeatherRate: () => 0, createCanvas: fakeCanvas,
      createGL: () => ({ render: () => { env.renders++; }, setSize() {}, dispose() {}, forceContextLoss() {}, getContext: () => null }) });
    env.made.push(r);
    return r;
  };
  const made = [];
  const view = new VIEW.ColonySphereView({ createRenderer: mkRenderer, createCanvas: recCanvas(made),
    getBuildingIcon: (id) => (id === 'mine' || id === 'colony_base' || id === 'factory' ? { width: 256, height: 256, id } : null) });
  const planet = terranBody();
  const grid = generateGeoGrid(planet, true);
  for (const t of grid.tiles) t.owner = 'player';
  const topo = geodesicTopology(grid.n);
  const cap = VIEW.bestGeoCapitalTile(grid).q;
  const near = grid.tiles.map((t, i) => i).filter(i => i !== cap && TERRAIN_TYPES[grid.tiles[i].type]?.buildable).sort((a, b) => topo.distance(cap, a) - topo.distance(cap, b));
  const T = grid.tiles;
  T[cap].capitalBase = true;
  T[near[0]].buildingId = 'mine'; T[near[0]].buildingLevel = 3;
  T[near[1]].buildingId = 'farm';
  T[near[2]].underConstruction = { buildingId: 'factory', progress: 0.5 };
  T[near[3]].buildingId = 'mine'; T[near[3]].damaged = true;
  T[near[4]].buildingId = 'mine'; T[near[4]].buildingLevel = 2; T[near[4]].underConstruction = { buildingId: 'mine', progress: 0.3, isUpgrade: true };
  const colony = { planet, planetId: planet.id, name: 'Terra Nova', civSystem: { population: 30 } };
  const rect = { x: 0, y: 0, w: 1000, h: 800 };
  const ctx0 = countCtx();
  view.renderer.turnTo?.(cap);
  for (let i = 0; i < 80; i++) { env.now += 1000 / 60; view.sync({ colony, grid, selected: { q: cap, r: -1 } }); view.renderer.draw(ctx0, rect); }
  const ctx = countCtx();
  view._drawMarkers(ctx, rect);
  const pages = new Set(ctx.images.map(a => a[0]));
  const info = view.markerInfo();
  assert(ctx.calls.drawImage === 12 && ctx.calls.fillText === 0 && info.portraits === 6 && info.dots === 0 && pages.size <= 3 && ctx.images.every(a => a.length === 9)
    && info.atlas.errors === 0 && info.msMedian >= 0 && info.frames >= 1,
    `B4a six marked tiles → 6 ground shadows + 6 portraits, all drawn as sub-rectangles of ${pages.size} atlas page(s) (batched), no emoji text`);
  // pierścień postępu: budowa + rozbudowa (2 × 3 łuki), pipsy: L3 = 3, L2 = 2; stolica: dysk ze złotym pierścieniem (1 łuk)
  assert(ctx.calls.arc === 2 * 3 + 5 + 1 && ctx.calls.ellipse === 5,
    `B4b states on screen: progress ring for the site and the upgrade, 3 + 2 level pips, capital disc with its ring, a category base under every non-capital building (arcs ${ctx.calls.arc}, bases ${ctx.calls.ellipse})`);
  const farCtx = countCtx();
  view._drawMarkers(farCtx, { x: 0, y: 0, w: 110, h: 90 });
  const farInfo = view.markerInfo();
  assert(farInfo.portraits === 1 && farInfo.dots === 5 && farCtx.calls.drawImage === 2 && farCtx.calls.arc === 5 + 1,
    'B4c far away (small frame): five category dots, only the capital keeps its portrait and ring');
  T[near[5]].buildingId = 'well';
  const back = topo.cx.map((_, i) => i).filter(i => topo.cx[i] * topo.cx[cap] + topo.cy[i] * topo.cy[cap] + topo.cz[i] * topo.cz[cap] < -0.5)[0];
  T[back].buildingId = 'mine';
  const ctx2 = countCtx();
  view._drawMarkers(ctx2, rect);
  assert(view.markerInfo().portraits === 7 && ctx2.calls.drawImage === 14,
    'B4d a new building appears in the next frame; a building on the far side of the sphere is not drawn');
  T[back].buildingId = null; T[near[5]].buildingId = null;
  viewEnv = { view, env, grid, colony, rect, cap, near, topo, planet };
}

// ── B5 barwa kategorii ────────────────────────────────────────────────────────────────
console.log('\nB5 category colour: subtle outline by default');
if (!OL.BUILDING_TINT || !viewEnv) missing(['B5a', 'B5b'], 'BUILDING_TINT'); else {
  const { grid, cap, near, topo, view } = viewEnv;
  const N = grid.tiles.length;
  const fillA = (d, i) => d[i * 4 + 3], lineA = (d, i) => d[(N + i) * 4 + 3], lineW = (d, i) => d[(2 * N + i) * 4 + 1] / 16;
  const def = OL.composeSphereOverlay({ topo, tiles: grid.tiles }), sub = OL.composeSphereOverlay({ topo, tiles: grid.tiles, tint: 'subtle' }), full = OL.composeSphereOverlay({ topo, tiles: grid.tiles, tint: 'full' });
  const same = def.every((v, i) => v === sub[i]);
  assert(same && OL.BUILDING_TINT_DEFAULT === 'subtle' && view.tint === 'subtle' && fillA(def, near[0]) === 0 && lineA(def, near[0]) > 0 && fillA(def, near[2]) === 0 && lineA(def, near[2]) > 0
    && fillA(full, near[0]) >= 60 && fillA(full, near[2]) > 0 && lineW(def, near[0]) < lineW(full, near[0]) && lineA(def, near[0]) < lineA(full, near[0]),
    'B5a default = subtle: a built tile and a construction site carry only a thin category outline (no fill); the A/B variant `full` tints the tile');
  assert(fillA(def, cap) === fillA(full, cap) && lineA(def, cap) === 255 && lineW(def, cap) >= 3 && OL.composeSphereOverlay({ topo, tiles: grid.tiles, tint: 'bogus' }).every((v, i) => v === def[i]),
    'B5b the capital keeps its gold outline in both variants; an unknown variant falls back to the default');
}

// ── B6 funkcja natężenia świateł ──────────────────────────────────────────────────────
console.log('\nB6 city-light intensity');
if (!CLL.cityLightsOf) missing(['B6a', 'B6b', 'B6c', 'B6d'], 'CityLightsLogic'); else {
  const f = CLL.colonyLightFactor;
  let mono = true;
  for (let b = 1; b < 60; b++) for (const p of [0, 10, 100]) { if (!(f(b + 1, p) > f(b, p)) || !(f(b, p + 5) > f(b, p))) mono = false; }
  assert(mono && f(0, 500) === 0 && Math.abs(f(1, 0) - CLL.CITY_LIGHTS.colonyFloor) < 1e-12 && f(200, 5000) <= 1 && f(200, 5000) > 0.99,
    'B6a colony factor grows strictly with buildings and with population, starts at the floor for one building, saturates at 1, is 0 for an empty colony');
  const w = CLL.tileLightWeight;
  assert(w({ type: 'plains' }) === 0 && w(null) === 0 && w({ damaged: true }) === 0 && w({ buildingId: 'habitat' }) > w({ buildingId: 'farm' }) && w({ buildingId: 'mine', buildingLevel: 5 }) > w({ buildingId: 'mine', buildingLevel: 1 })
    && w({ buildingId: 'mine', buildingLevel: 99 }) === w({ buildingId: 'mine', buildingLevel: 50 }) && w({ capitalBase: true }) === CLL.CITY_LIGHTS.capitalWeight
    && w({ underConstruction: { buildingId: 'farm' } }) === CLL.CITY_LIGHTS.constructionGlow && w({ underConstruction: { buildingId: 'farm' } }) < w({ buildingId: 'farm' })
    && w({ buildingId: '__unknown__' }) === CLL.CITY_LIGHTS.defaultWeight,
    'B6b tile weight: empty tile 0, grows with the level (clamped), housing brighter than a farm, capital brightest, a construction site only work lights');
  const mk = (n, lv = 1) => { const t = []; for (let i = 0; i < 40; i++) t.push(i === 0 ? { capitalBase: true } : (i <= n ? { buildingId: 'habitat', buildingLevel: lv } : { type: 'plains' })); return t; };
  const a = CLL.cityLightsOf(mk(5), 20), a2 = CLL.cityLightsOf(mk(5), 20), b = CLL.cityLightsOf(mk(12), 20), c = CLL.cityLightsOf(mk(5), 200), d = CLL.cityLightsOf(mk(5, 4), 20);
  const sum = (x) => x.data.reduce((s, v) => s + v, 0);
  assert(a.signature === a2.signature && Array.from(a.data).join() === Array.from(a2.data).join() && a.buildings === 6 && a.lit === 6 && a.any && a.data[9] === 0
    && sum(b) > sum(a) && b.data[1] > a.data[1] && sum(c) > sum(a) && sum(d) > sum(a) && b.signature !== a.signature && c.signature !== a.signature
    && Math.max(...CLL.cityLightsOf(mk(39, 10), 9999).data) <= 1,
    'B6c deterministic (same input → same values and signature); more buildings, more people or higher levels → brighter, also on the tiles already built; never above 1');
  const empty = CLL.cityLightsOf(mk(0).map((t, i) => (i === 0 ? { type: 'plains' } : t)), 50), siteOnly = CLL.cityLightsOf([{ underConstruction: { buildingId: 'farm' } }, { type: 'plains' }], 0);
  const reuse = CLL.cityLightsOf(mk(5), 20, a);
  assert(!empty.any && empty.lit === 0 && empty.factor === 0 && siteOnly.any && siteOnly.data[0] > 0 && siteOnly.data[0] < 0.1 && reuse.data === a.data
    && CLL.populationOfColony({ civSystem: { population: 12.7 } }) === 12 && CLL.populationOfColony({ civSystem: { humans: 8, population: 99 } }) === 8
    && CLL.populationOfColony({ isOutpost: true, civSystem: { population: 5 } }) === 0 && CLL.populationOfColony(null) === 0,
    'B6d no buildings → no lights at all; a lone construction site glows faintly; the buffer is reused; population read like the console list (outpost = 0)');
}

// ── B7 mapa świateł ───────────────────────────────────────────────────────────────────
console.log('\nB7 light map');
if (!CLL.rasterizeCityLights) missing(['B7a', 'B7b', 'B7c'], 'rasterizeCityLights'); else {
  const topo = geodesicTopology(6), W = 256, H = 128;
  const nearestOf = (x, y, z) => { let best = -1, bd = -2; for (let i = 0; i < topo.count; i++) { const d = x * topo.cx[i] + y * topo.cy[i] + z * topo.cz[i]; if (d > bd) { bd = d; best = i; } } return best; };
  const lights = new Float32Array(topo.count);
  const pole = Array.from({ length: topo.count }, (_, i) => i).sort((a, b) => topo.cy[b] - topo.cy[a])[0];
  const eq = Array.from({ length: topo.count }, (_, i) => i).sort((a, b) => Math.abs(topo.cy[a]) - Math.abs(topo.cy[b]))[0];
  const seam = Array.from({ length: topo.count }, (_, i) => i).filter(i => Math.abs(topo.cy[i]) < 0.4).sort((a, b) => topo.cx[a] - topo.cx[b])[0];   // przy południku ±180°
  lights[pole] = 1; lights[eq] = 0.5; lights[seam] = 0.8;
  const lit = new Set([pole, eq, seam]);
  const map = CLL.rasterizeCityLights(topo, lights, W, H);
  let outside = 0, inside = 0, cells = { [pole]: 0, [eq]: 0, [seam]: 0 }, maxEq = 0;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const val = map[(v * W + u) * 4];
    const lat = ((v + 0.5) / H - 0.5) * Math.PI, lon = ((u + 0.5) / W - 0.5) * 2 * Math.PI;
    const n = nearestOf(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    if (val > 0) { if (lit.has(n)) { inside++; cells[n]++; if (n === eq) maxEq = Math.max(maxEq, val); } else outside++; }
  }
  // strojenie z jaśniejszą krawędzią pola (edgeFloor > 0): granica komórki nadal trzyma światło w polu
  const mapE = CLL.rasterizeCityLights(topo, lights, W, H, null, { ...CLL.CITY_LIGHTS, edgeFloor: 0.3 });
  let outsideE = 0, insideE = 0;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    if (!(mapE[(v * W + u) * 4] > 0)) continue;
    const lat = ((v + 0.5) / H - 0.5) * Math.PI, lon = ((u + 0.5) / W - 0.5) * 2 * Math.PI;
    if (lit.has(nearestOf(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)))) insideE++; else outsideE++;
  }
  assert(outside === 0 && outsideE === 0 && insideE >= inside && cells[pole] > 20 && cells[eq] > 8 && cells[seam] > 8 && inside === cells[pole] + cells[eq] + cells[seam] && maxEq <= 128 && maxEq >= 110,
    `B7a every lit texel lies inside the cell of a lit tile (${inside} texels, 0 outside) — at the pole, at the equator and across the ±180° seam, also with a brighter cell edge (${insideE} texels, ${outsideE} outside); brightness follows the tile intensity`);
  const uvOf = (i) => CLL.lightUvOf(topo.cx[i], topo.cy[i], topo.cz[i]);
  const at = (i) => { const [u, v] = uvOf(i); return map[(Math.min(H - 1, Math.floor(v * H)) * W + Math.min(W - 1, Math.floor(u * W))) * 4]; };
  const [ue, ve] = uvOf(eq);
  let edgeMin = 255;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { const val = map[(v * W + u) * 4]; if (val > 0 && Math.hypot(u - ue * W, v - ve * H) < 12) edgeMin = Math.min(edgeMin, val); }
  assert(at(pole) >= 250 && Math.abs(at(eq) - 128) <= 3 && Math.abs(at(seam) - 204) <= 4 && edgeMin < at(eq) * 0.6 && edgeMin > 0,
    'B7b the centre of a tile carries its full intensity (uv convention = lightUvOf), the cell edge is dimmer but not dark');
  const again = CLL.rasterizeCityLights(topo, lights, W, H);
  const sameBytes = map.every((v, i) => v === again[i]);
  const reused = CLL.rasterizeCityLights(topo, new Float32Array(topo.count), W, H, again);
  assert(sameBytes && reused === again && reused.every((v, i) => (i % 4 === 3 ? v === 255 : v === 0)),
    'B7c deterministic bytes; a reused buffer is cleared (no lights → an all-dark map)');
}

// ── B8 shader i kula ──────────────────────────────────────────────────────────────────
console.log('\nB8 shader and the hero sphere');
if (!CLS.CITY_FRAG || !viewEnv) missing(['B8a', 'B8b', 'B8c'], 'CityLightsShader'); else {
  const frag = stripComments(CLS.CITY_FRAG), vert = stripComments(CLS.CITY_VERT);
  assert(/uniform vec3 uSunPos/.test(frag) && /night\s*=\s*1\.0\s*-\s*smoothstep\(uNightEdge\.x,\s*uNightEdge\.y,\s*nl\)/.test(frag) && /nl\s*=\s*dot\(N,\s*normalize\(uSunPos\s*-\s*vWorld\)\)/.test(frag)
    && /atan\(d\.z,\s*d\.x\)\s*\/\s*\(2\.0\s*\*\s*PI\)\s*\+\s*0\.5/.test(frag) && /asin\(clamp\(d\.y,\s*-1\.0,\s*1\.0\)\)\s*\/\s*PI\s*\+\s*0\.5/.test(frag)
    && !frag.includes('`') && !vert.includes('`') && !/uTime|iTime/.test(frag) && vert.trim().endsWith('}') && vert.lastIndexOf('gl_Position') > vert.lastIndexOf('vNormalW'),
    'B8a GLSL: night mask from the star direction (uSunPos), the same direction → uv mapping as the rasterizer, no clock (deterministic), no backticks');
  const tex = CLS.createCityTexture(THREE, new Uint8Array(8 * 4 * 4), 8, 4);
  const shared = { uSunPos: { value: [1, 2, 3] } };
  const hero = CLS.createCityMaterial(THREE, tex, { shared, depthTest: false, seed: 0xC57B }), sys = CLS.createCityMaterial(THREE, tex, { shared, logDepth: true, depthTest: true, density: CLL.CITY_LIGHTS.systemDensity });
  assert(hero.blending === THREE.AdditiveBlending && hero.depthWrite === false && hero.depthTest === false && hero.uniforms.uSunPos === shared.uSunPos && hero.uniforms.uLights.value === tex
    && sys.depthTest === true && sys.fragmentShader !== hero.fragmentShader && sys.fragmentShader.includes('gl_FragDepth') && sys.uniforms.uDensity.value[0] === CLL.CITY_LIGHTS.systemDensity[0]
    && tex.wrapS === THREE.RepeatWrapping && tex.flipY === false && CLS.cityLightSeed(0xC57B) === CLS.cityLightSeed(0xC57B) && CLS.cityLightSeed(1) !== CLS.cityLightSeed(2) && CLS.cityLightSeed('x') === 0,
    'B8b material: additive, no depth write, shares the surface shader sun uniform; system-map variant uses the log-depth chunks and its own density; the seed offset is deterministic per body');
  const { view, env, grid, colony, rect } = viewEnv;
  const r = view.renderer, ctx = countCtx();
  env.now += 20; view.sync({ colony, grid }); r.draw(ctx, rect);
  const withLights = r.info();
  const lightsInfo = view.markerInfo().lights;
  const uGain0 = r._obj?.city?.material?.uniforms?.uGain?.value;
  env.now += 20; view.sync({ colony, grid, buildMenu: true }); r.draw(ctx, rect);
  const uGainWork = r._obj?.city?.material?.uniforms?.uGain?.value;
  const saved = grid.tiles.map(t => [t.buildingId, t.capitalBase, t.underConstruction]);
  for (const t of grid.tiles) { t.buildingId = null; t.capitalBase = false; t.underConstruction = null; }
  env.now += 20; view.sync({ colony, grid }); r.draw(ctx, rect);
  const without = r.info();
  grid.tiles.forEach((t, i) => { [t.buildingId, t.capitalBase, t.underConstruction] = saved[i]; });
  env.now += 20; view.sync({ colony, grid }); r.draw(ctx, rect);
  assert(withLights.cityLights && withLights.cityMesh && lightsInfo?.any && lightsInfo.lit === 6 && uGain0 === CLL.CITY_LIGHTS.heroGain && uGainWork < uGain0 * 0.5
    && !without.cityLights && !without.cityMesh && r.info().cityMesh && r._obj.city.material.uniforms.uSunPos === r._shared.uSunPos && r._obj.city.renderOrder < r._obj.overlay.renderOrder,
    'B8c hero sphere: the light shell appears with the first lit tile, shares the camera-locked sun, dims in build mode, hides when nothing is lit and returns with the buildings');
}

// ── B9 Finding 784 ────────────────────────────────────────────────────────────────────
console.log('\nB9 Finding 784 — system-map icons for geo colonies');
if (!BL.geoTileDirOf) missing(['B9a', 'B9b'], 'geoTileDirOf'); else {
  const planet = terranBody(), geo = generateGeoGrid(planet, true), topo = geodesicTopology(geo.n);
  const flat = PlanetMapGenerator.generate(planet, true);
  let ok = true;
  for (const i of [0, 5, 11, 12, Math.floor(topo.count / 2), topo.count - 1]) {
    const d = BL.geoTileDirOf(geo, geo.tiles[i]);
    if (!d || Math.abs(d[0] - topo.cx[i]) > 1e-12 || Math.abs(d[1] - topo.cy[i]) > 1e-12 || Math.abs(d[2] - topo.cz[i]) > 1e-12 || Math.abs(Math.hypot(...d) - 1) > 1e-9) ok = false;
  }
  let flatTile = null; flat.forEach?.((t) => { flatTile ??= t; });
  assert(ok && BL.geoTileDirOf(flat, flatTile) === null && BL.geoTileDirOf(geo, null) === null && BL.geoTileDirOf(geo, { q: topo.count, r: -1 }) === null && BL.geoTileDirOf(null, geo.tiles[0]) === null,
    'B9a a geo tile maps to the unit direction of its centre in the body frame; a flat grid / foreign tile gives null (flat path untouched)');
  const m = stripComments(src('src/renderer/ColonyBuildingMarkers.js')), tr = stripComments(src('src/renderer/ThreeRenderer.js'));
  const body = m.slice(m.indexOf('_tileToXYZ(tile, r) {'), m.indexOf('_createMarkerTexture(icon, category, portrait = null)'));
  assert(/if \(this\._grid\?\.kind === 'geo'\) \{\s*const d = geoTileDirOf\(this\._grid, tile\);\s*return d \? new THREE\.Vector3\(d\[0\] \* r, d\[1\] \* r, d\[2\] \* r\) : null;\s*\}/.test(body)
    && body.includes("if (tile.q === undefined || tile.r === undefined || !this._grid?.gridPixelSize) return null;") && body.includes('HexGrid.hexToPixel(tile.q, tile.r, hexSize)')
    && /this\._colonyMarkers\.show\(colony\.grid\.kind === 'geo' \? \(pEntry\.mesh \?\? pEntry\.group\) : pEntry\.group, r, colony\.grid, entity\.id\)/.test(tr)
    && /if \(portrait\) return this\._createPortraitTexture\(portrait, category\);/.test(m) && /const portrait = isGeo \? getBuildingTexture\(/.test(m),
    'B9b source pin: the marker position of a geo grid comes from geoTileDirOf and rides the spinning surface mesh; the flat branch and the flat emoji marker are unchanged');
}

// ── B10 mapa układu wykonaniem ────────────────────────────────────────────────────────
console.log('\nB10 system map by execution');
if (!CCL.ColonyCityLights || !CLL.cityLightsOf) missing(['B10a', 'B10b', 'B10c'], 'ColonyCityLights'); else {
  const planet = terranBody({ id: 'p_geo' }), geo = generateGeoGrid(planet, true);
  const flatPlanet = terranBody({ id: 'p_flat' }), flat = PlanetMapGenerator.generate(flatPlanet, true);
  const land = geo.tiles.filter(t => TERRAIN_TYPES[t.type]?.buildable);
  land[0].capitalBase = true; land[1].buildingId = 'habitat';
  const meshes = { p_geo: new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6)), p_flat: new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6)) };
  const colonies = [{ planetId: 'p_geo', planet, grid: geo, civSystem: { population: 10 } }, { planetId: 'p_flat', planet: flatPlanet, grid: flat, civSystem: { population: 500 } },
    { planetId: 'p_elsewhere', planet, grid: geo, civSystem: { population: 10 } }];
  const lights = new CCL.ColonyCityLights({ THREE, getColonies: () => colonies, getTarget: (id) => (meshes[id] ? { mesh: meshes[id], radius: 0.2 } : null), logDepth: () => true, shared: { uSunPos: { value: [0, 0, 0] } }, intervalMs: 1000 });
  const t0 = lights.tick(0), t1 = lights.tick(500), t2 = lights.tick(1000);
  const child = meshes.p_geo.children[0];
  assert(t0 === true && t1 === false && t2 === true && lights.info().bodies.join() === 'p_geo' && meshes.p_geo.children.length === 1 && meshes.p_flat.children.length === 0
    && child.userData.isCityLights && child.material.blending === THREE.AdditiveBlending && child.material.fragmentShader.includes('gl_FragDepth') && lights.rasters === 1
    && Math.abs(child.geometry.parameters.radius - 0.2 * CLL.CITY_LIGHTS.systemRadius) < 1e-12 && child.material.uniforms.uLights.value.image.data.some(v => v > 0 && v < 255),
    'B10a one additive light shell per geo colony whose body is on the map, a child of the surface mesh just above the surface; a flat colony and a colony elsewhere get nothing; reviewed on an interval, rasterized once');
  land[2].buildingId = 'factory';
  lights.sync(); const afterBuild = lights.rasters; lights.sync();
  colonies[0].civSystem.population = 400; lights.sync();
  assert(afterBuild === 2 && lights.rasters === 3 && meshes.p_geo.children.length === 1 && meshes.p_geo.children[0] === child,
    'B10b the map is redrawn only when the lights change (a new building, more people) — same shell, no work in between');
  const newMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6)); const old = meshes.p_geo; meshes.p_geo = newMesh; lights.sync();
  const moved = old.children.length === 0 && newMesh.children.length === 1;
  for (const t of geo.tiles) { t.buildingId = null; t.capitalBase = false; }
  lights.sync(); const dark = newMesh.children.length === 0 && lights.info().bodies.length === 0;
  land[0].capitalBase = true; lights.sync(); const back = newMesh.children.length === 1;
  delete meshes.p_geo; lights.sync(); const gone = newMesh.children.length === 0;
  meshes.p_geo = newMesh; lights.sync(); lights.dispose();
  assert(moved && dark && back && gone && newMesh.children.length === 0 && lights.info().bodies.length === 0,
    'B10c the shell follows a rebuilt body mesh, disappears when nothing is lit or the body leaves the map, and dispose removes everything');
}

// ── B11 flaga OFF / siatka płaska / piny źródła ───────────────────────────────────────
console.log('\nB11 flag OFF, flat colonies, source pins');
{
  assert(GAME_CONFIG.FEATURES.colonySphere === false, 'B11a FEATURES.colonySphere default OFF');
  const tr = stripComments(src('src/renderer/ThreeRenderer.js')), ccl = stripComments(src('src/renderer/ColonyCityLights.js')), sv = stripComments(src('src/ui/ColonySphereView.js'));
  const ov = stripComments(src('src/ui/ColonyOverlay.js')), bt = stripComments(src('src/renderer/BuildingTextures.js'));
  assert(/if \(!id \|\| grid\?\.kind !== 'geo' \|\| !Array\.isArray\(grid\.tiles\)\) continue;/.test(ccl) && /_cityLightTarget\(bodyId\) \{\s*if \(!this\._sharedSurfaces\.has\(bodyId\)\) return null;/.test(tr)
    && /this\._cityLights\.tick\(performance\.now\(\)\)/.test(tr) && !/CityLights|ColonyBillboard/.test(ov),
    'B11b system-map lights skip every non-geo grid and need the shared-surface body; the colony window itself (flat path) does not know the CS-9 modules');
  assert(/const tasks = ids\.map\(\(id\) => \(\{ src: `\$\{BASE_PATH\}\$\{id\}\.png`/.test(bt) && /const BASE_PATH = 'assets\/buildings\/';/.test(bt) && /const ids = Object\.keys\(BUILDINGS\);/.test(bt)
    && /this\._atlas\.portrait\(spec\.portraitId, spec\.state, spec\.category, img, size \* dpr\)/.test(sv) && !/fillText\(icon, x, y\)/.test(sv),
    'B11c art pipeline: every building id is looked up at assets/buildings/{id}.png and reaches the sphere through the atlas — new art needs no code');
  const smoke = stripComments(src('src/debug/ColonyBuildingsDebug.js'));
  assert(/export function csCity\(\)/.test(smoke) && /grid\?\.kind !== 'geo'/.test(smoke) && /for \(const k of \['csCity', 'csCityRepair', 'csTint', 'csDots', 'csBuildings', 'csNight', 'csDay'\]\)/.test(stripComments(src('src/scenes/GameScene.js'))),
    'B11d owner helpers registered (csCity, csCityRepair, csTint, csDots, csBuildings, csNight, csDay); csCity refuses a flat colony');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
