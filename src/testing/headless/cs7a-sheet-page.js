// cs7a-sheet-page — moduł PRZEGLĄDARKI dla sondy `probe-cs7a-hero.mjs` (ARC COLONY SPHERE, krok CS-7 część A; plan §3.15).
//
// Arkusz kontaktowy PRAWDZIWYM rendererem gry: `ColonySphereRenderer` (ten sam SurfaceShader / SurfaceAirShader co mapa
// układu) na mapach z prawdziwego `SurfaceCache` (worker) i siatkach `generateGeoGrid`. Do tego sonda kompilacji GLSL
// nakładki pól z kontrolą, która MUSI się nie skompilować, i pomiar kosztu klatki (bezczynność / auto-obrót / przeciąganie).

import * as THREE from 'three';
import { ColonySphereRenderer } from '../../renderer/ColonySphereRenderer.js';
import { ColonySphereOverlayShader as OV } from '../../renderer/ColonySphereOverlayShader.js';
import { SPHERE_TUNING, buildTileMesh, createOverlayData, writeOverlayTile, nearestTile, dirOf } from '../../renderer/ColonySphereLogic.js';
import { composeSphereOverlay, sphereLegend, fallbackColorsOf, BUILD_VERDICT } from '../../ui/ColonySphereOverlayLogic.js';
import { drawSphereChrome, sphereThemeColors } from '../../ui/ColonySphereChrome.js';
import { SurfaceCache } from '../../systems/SurfaceCache.js';
import { generateGeoGrid } from '../../map/GeoColonyGridGenerator.js';
import { geodesicTopology } from '../../map/GeodesicTopology.js';
import { TERRAIN_TYPES, evaluatePlacement } from '../../map/HexTile.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { STAR_TYPES } from '../../config/GameConfig.js';
import { PRESET_THEMES, applyPreset } from '../../config/ThemeConfig.js';
import { mixSeed } from '../../utils/SeedMath.js';
import { fakeBody } from './cs6a-sheet-page.js';

const cache = new SurfaceCache({ activeSystemId: () => 'sys_home' });
const ATMOSPHERE_OF = { terran: 'breathable', ocean: 'breathable', jungle: 'breathable', desert: 'thin', ice: 'thin', volcanic: 'thin',
  hothouse: 'dense', cryo_haze: 'dense', tidally_locked: 'thin', hazy_moon: 'dense' };
const THEMES = ['ss_amber_noir', 'ss_cold_blue', 'ss_galactic_violet', 'ss_neon_cyber', 'ss_biopunk_green'];

function bodyOf(archId, seed, extra = {}) {
  return fakeBody(archId, seed, { atmosphere: ATMOSPHERE_OF[archId] ?? 'none', systemId: 'sys_home', ...extra });
}

function starOf(cls) {
  const st = STAR_TYPES[cls] ?? STAR_TYPES.G;
  return { colorHex: st.color, spectralType: cls, luminosity: st.luminosity ?? 1 };
}

/** Pole stolicy arkusza: pierwsze budowalne pole najbliżej (lon 0,6; lat 0,35). */
function capitalOf(grid, topo) {
  const want = dirOf(0.6, 0.35);
  let best = 0, bd = -2;
  for (let i = 0; i < topo.count; i++) {
    if (!TERRAIN_TYPES[grid.tiles[i].type]?.buildable) continue;
    const d = topo.cx[i] * want[0] + topo.cy[i] * want[1] + topo.cz[i] * want[2];
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

/** Zabuduj okolicę stolicy (dane arkusza): stolica + kilka budynków różnych kategorii + plac budowy; wszystko własne. */
function dressGrid(grid, topo, capital, { foreignPatch = false } = {}) {
  for (const t of grid.tiles) t.owner = 'player';
  grid.tiles[capital].capitalBase = true;
  const ids = ['mine', 'solar_farm', 'farm', 'habitat', 'research_station', 'factory'].filter(id => BUILDINGS[id]);
  const near = topo.within(capital, 2).filter(i => i !== capital && TERRAIN_TYPES[grid.tiles[i].type]?.buildable);
  let k = 0;
  for (const i of near) {
    if (k >= ids.length + 1) break;
    if (k < ids.length) { grid.tiles[i].buildingId = ids[k]; grid.tiles[i].buildingLevel = 1 + (k % 3); }
    else grid.tiles[i].underConstruction = { buildingId: 'mine', progress: 0.4 };
    k += 2 - (k % 2);   // co drugie pole — widać pola wolne między budynkami
  }
  if (foreignPatch) {
    const far = topo.within(capital, 4).filter(i => topo.distance(capital, i) >= 3).slice(0, 14);
    for (const i of far) { grid.tiles[i].owner = 'emp_rival'; }
    if (far.length) grid.tiles[far[0]].occupyEmpireId = 'emp_rival';
  }
}

async function warm(body) {
  await cache.request(body);
  await cache.request(body, 'hero');
}

/**
 * Jedna klatka bohatera na płótnie 2D arkusza. `setup(r, ctxInfo)` ustawia tryb / nakładkę / kursor; czas arkusza płynie
 * sztucznym zegarem (40 kroków × 100 ms), więc przenikania i dojazd zoomu są zakończone, a klatka jest powtarzalna.
 */
async function heroFrame(g, rect, body, opts = {}) {
  await warm(body);
  const grid = generateGeoGrid(body, true);
  const topo = geodesicTopology(grid.n);
  const capital = opts.capital ?? capitalOf(grid, topo);
  if (opts.dress !== false) dressGrid(grid, topo, capital, opts);
  let now = 0;
  const tuning = { ...SPHERE_TUNING, ...(opts.tuning ?? {}) };
  const r = new ColonySphereRenderer({ THREE, now: () => now, getCache: () => (opts.cache ?? cache), getWeatherRate: () => 1, tuning });
  r.setBody({ body, n: grid.n, star: starOf(opts.star ?? 'G'), capitalTile: capital });
  const colors = sphereThemeColors();
  r.setColors(colors);
  r.setFallbackColors(fallbackColorsOf(grid.tiles));
  const state = { lens: opts.lens ?? 'none', build: null, supply: null };
  if (opts.build) {
    const b = BUILDINGS[opts.build];
    state.build = (tile) => (tile.buildingId || tile.capitalBase || tile.underConstruction ? BUILD_VERDICT.OCCUPIED
      : (evaluatePlacement(tile, b, { planet: body }).ok ? BUILD_VERDICT.OK : BUILD_VERDICT.BLOCKED));
  }
  r.setOverlay(composeSphereOverlay({ topo, tiles: grid.tiles, lens: state.lens, buildVerdict: state.build, accent: colors.accentBytes }));
  r.setMode({ lock: true, gridAll: !!opts.build, work: !!opts.build || state.lens !== 'none', selectedTile: opts.select === true ? capital : (opts.select ?? -1) });
  if (opts.fallback) r.forceFallback(true);
  const steps = opts.steps ?? 40;
  let res = null;
  for (let i = 0; i < steps; i++) {
    now += 100;
    if (opts.hover && i === steps - 3) r.pointerMove(rect.x + rect.w * opts.hover[0], rect.y + rect.h * opts.hover[1], rect);
    if (opts.onStep) opts.onStep(r, i, now);
    res = r.draw(g, rect, { now });
    if (i === 0 && opts.zoom) r.wheel(-opts.zoom);   // po pierwszej klatce (widok startowy już ustawiony)
  }
  const info = r.info();
  if (opts.chrome) {
    drawSphereChrome(g, rect, { title: opts.title ?? body.bodyArchetype, archetype: body.bodyArchetype, tiles: topo.count, lens: state.lens,
      build: !!opts.build, legend: sphereLegend({ lens: state.lens, build: !!opts.build }), fallback: info.mode === '2d' });
  }
  r.release();
  return { info, res, capital, tiles: topo.count };
}

function label(g, text, x, y, color = '#9fb4c8', font = '12px Consolas, monospace') {
  g.font = font; g.fillStyle = color; g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillText(text, x, y);
}

/** Pamięć podręczna, która UKRYWA mapę bohatera do odwołania (dowód LOD → przenikanie → bohater). */
function gatedCache(state) {
  return {
    get: (b, lod) => (lod === 'hero' && !state.hero ? null : cache.get(b, lod)),
    request: (b, lod, p) => (lod === 'hero' && !state.hero ? new Promise(() => {}) : cache.request(b, lod, p)),
  };
}

/** cs7a-hero-sheet: bohaterowie archetypów, klatki interakcji, światło, przenikanie mapy, rama w 5 motywach. */
export async function renderHeroSheet() {
  const CELL = 400, WIDE = 560, LAB = 22, TOP = 30;
  const W = 7 * CELL, H = TOP + (CELL + LAB) + 3 * (CELL + LAB) + 8;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  g.fillStyle = '#04060a'; g.fillRect(0, 0, W, H);
  label(g, 'CS-7a · ColonySphereRenderer — colony sphere hero · same SurfaceShader / air shaders as the system map · hero map 1024×512 · star G', 10, 8, '#e6eef6', 'bold 14px Consolas, monospace');
  const meta = [];

  // Wiersz 1 — bohaterowie: terran, ice, desert, hothouse (Wenus), cryo_haze (Tytan), księżyc, planetoida
  const heroes = [['terran'], ['ice'], ['desert'], ['hothouse'], ['cryo_haze'], ['icy_cracked'], ['planetoid', { planetoidType: 'metallic' }]];
  let y = TOP;
  for (let i = 0; i < heroes.length; i++) {
    const [arch, extra] = heroes[i];
    const body = bodyOf(arch, mixSeed(0xC57A + i * 7919), extra ?? {});
    const rect = { x: i * CELL, y, w: CELL, h: CELL };
    const f = await heroFrame(g, rect, body, { dress: false });
    label(g, `${arch}${extra?.planetoidType ? ' · ' + extra.planetoidType : ''} · ${f.tiles} tiles · haze ${f.info.haze == null ? '—' : f.info.haze.toFixed(2)} · ${f.info.mapPhase}`, rect.x + 6, y + CELL + 4);
    meta.push({ arch, ...f.info });
  }

  // Wiersze 2–3 — klatki interakcji na jednej planecie terran
  const terran = () => bodyOf('terran', mixSeed(0xC57A));
  y += CELL + LAB;
  const rowB = [
    ['hover — grid near the cursor only', { zoom: 300, hover: [0.56, 0.52] }],
    ['selection + own building tiles (category tint)', { zoom: 300, select: true }],
    ['build mode — full grid, allowed / forbidden / occupied', { zoom: 200, build: 'farm', hover: [0.45, 0.42] }],
    ['lens: terrain', { lens: 'terrain' }],
    ['lens: ownership (foreign patch, border edges)', { lens: 'ownership', foreignPatch: true, zoom: 250 }],
  ];
  for (let i = 0; i < rowB.length; i++) {
    const rect = { x: i * WIDE, y, w: WIDE, h: CELL };
    const f = await heroFrame(g, rect, terran(), { ...rowB[i][1], chrome: true, title: 'Terra Nova' });
    label(g, rowB[i][0], rect.x + 6, y + CELL + 4);
    meta.push({ frame: rowB[i][0], hover: f.info.hoverTile, sel: f.info.selectedTile, gridAll: f.info.gridAll });
  }
  y += CELL + LAB;
  const gate = { hero: false };
  const rowC = [
    ['lens: deposits (where mining pays)', { lens: 'deposits' }],
    ['day + terminator through the centre (star 96° off the view)', { tuning: { sunAzimuthDeg: 96 } }],
    ['night side with the soft fill (readable terrain)', { tuning: { sunAzimuthDeg: 150 }, zoom: 300, hover: [0.5, 0.5] }],
    ['Venus deck at the system-map opacity (not thinned) — compare row 1', { arch: 'hothouse', tuning: { hazeMax: 1 } }],
    ['2D fallback (no WebGL): same camera, same picking', { fallback: true, select: true, hover: [0.6, 0.45] }],
  ];
  for (let i = 0; i < rowC.length; i++) {
    const rect = { x: i * WIDE, y, w: WIDE, h: CELL };
    const o = rowC[i][1];
    const body = o.arch ? bodyOf(o.arch, mixSeed(0xC57A + 3 * 7919)) : terran();
    await heroFrame(g, rect, body, { ...o, chrome: !o.arch, dress: !o.arch, title: 'Terra Nova' });
    label(g, rowC[i][0], rect.x + 6, y + CELL + 4);
  }

  // Wiersz 4 — rama bohatera w 5 motywach + przenikanie LOD → bohater
  y += CELL + LAB;
  for (let i = 0; i < THEMES.length; i++) {
    applyPreset(PRESET_THEMES[THEMES[i]]);
    const rect = { x: i * WIDE, y, w: WIDE, h: CELL };
    g.fillStyle = 'rgba(2,4,8,1)'; g.fillRect(rect.x, rect.y, rect.w, rect.h);
    await heroFrame(g, rect, terran(), { chrome: true, title: 'Terra Nova', lens: i === 1 ? 'deposits' : 'none', build: i === 3 ? 'mine' : null,
      select: i === 0 ? true : -1, zoom: i === 0 ? 420 : 0, hover: i === 2 ? [0.52, 0.5] : null });
    label(g, 'theme: ' + THEMES[i], rect.x + 6, y + CELL + 4);
  }
  applyPreset(PRESET_THEMES.default);
  return { png: out.toDataURL('image/png'), w: W, h: H, meta, gate };
}

/** cs7a-hero-swap: ta sama klatka z mapą LOD, w połowie przenikania i z mapą bohatera (wycinek ×2 środka tarczy). */
export async function renderSwapStrip() {
  const CELL = 520, LAB = 22, TOP = 30;
  const out = document.createElement('canvas');
  out.width = 3 * CELL; out.height = TOP + CELL + LAB;
  const g = out.getContext('2d');
  g.fillStyle = '#04060a'; g.fillRect(0, 0, out.width, out.height);
  label(g, 'CS-7a · LOD-first: enlarged system-map LOD 256×128 → crossfade → hero map 1024×512 (zoomed view, same camera)', 10, 8, '#e6eef6', 'bold 14px Consolas, monospace');
  const phases = [];
  const body = bodyOf('terran', mixSeed(0xC57A));
  const shots = [['LOD 256×128 (shown immediately)', 30, false], ['mid crossfade', 32, true], ['hero 1024×512', 60, true]];
  for (let i = 0; i < shots.length; i++) {
    const state = { hero: false };
    const rect = { x: i * CELL, y: TOP, w: CELL, h: CELL };
    const f = await heroFrame(g, rect, body, { dress: false, cache: gatedCache(state), zoom: 900, steps: shots[i][1],
      onStep: (r, k) => { if (shots[i][2] && k === 29) state.hero = true; } });
    label(g, `${shots[i][0]} · phase ${f.info.mapPhase}`, rect.x + 6, TOP + CELL + 4);
    phases.push(f.info.mapPhase);
  }
  return { png: out.toDataURL('image/png'), phases };
}

/** Sonda kompilacji GLSL nakładki pól: program musi się skompilować i zapalić piksele; kontrola MUSI paść. */
export function compileProbe() {
  const out = [];
  for (const broken of [false, true]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const renderer = new THREE.WebGLRenderer({ canvas });
    const errors = [];
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      errors.push(String(gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || 'link error').slice(0, 240));
    };
    const topo = geodesicTopology(3);
    const data = createOverlayData(topo.count);
    for (let i = 0; i < topo.count; i++) writeOverlayTile(data, topo.count, i, { fill: [40, 200, 90, 160], line: [255, 255, 255, 255], lineWidth: 1.5, borderMask: 63 });
    const tex = OV.createOverlayTexture(THREE, data, topo.count);
    const mat = OV.createOverlayMaterial(THREE, tex, 1);
    mat.uniforms.uGridAll.value = 1;
    if (broken) mat.fragmentShader = mat.fragmentShader.replace('float limb =', 'cs7a_broken_control; float limb =');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4.4);
    scene.add(new THREE.Mesh(OV.createOverlayGeometry(THREE, buildTileMesh(topo)), mat));
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    let lit = 0;
    for (let x = 8; x < 96; x += 4) { gl.readPixels(x, 48, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); lit = Math.max(lit, px[0] + px[1] + px[2]); }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.push({ which: 'overlay', broken, errors, lit, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' });
    mat.dispose(); tex.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
  return out;
}

/** Sonda całego renderera: klatka WebGL terran (tryb `gl`, obraz nie jest jednolity) + trafienie w pole stolicy. */
export async function rendererProbe() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480;
  const g = c.getContext('2d', { willReadFrequently: true });
  const rect = { x: 0, y: 0, w: 640, h: 480 };
  const f = await heroFrame(g, rect, bodyOf('terran', mixSeed(0xC57A)), { select: true });
  const d = g.getImageData(0, 0, 640, 480).data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < min) min = v; if (v > max) max = v; }
  return { mode: f.info.mode, mapPhase: f.info.mapPhase, renders: f.info.renders, spread: max - min, selected: f.info.selectedTile, capital: f.capital,
    glError: f.info.glError };
}

/**
 * Koszt klatki przy kadrze `w × h` px urządzenia: bezczynność (zaznaczone pole, pogoda), auto-obrót (30 kl./s),
 * przeciąganie (render co klatkę). Mierzone w pętli rAF z oczekiwaniem na GPU po każdym renderze (readPixels).
 */
export async function measure(w = 1375, h = 1000, archId = 'terran') {
  const body = bodyOf(archId, mixSeed(0xC57A));
  await warm(body);
  const grid = generateGeoGrid(body, true);
  const topo = geodesicTopology(grid.n);
  const capital = capitalOf(grid, topo);
  dressGrid(grid, topo, capital);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  const r = new ColonySphereRenderer({ THREE, getCache: () => cache, getWeatherRate: () => 1 });
  r.setMeasureSync(true);
  r.setBody({ body, n: grid.n, star: starOf('G'), capitalTile: capital });
  r.setColors(sphereThemeColors());
  r.setOverlay(composeSphereOverlay({ topo, tiles: grid.tiles }));
  const rect = { x: 0, y: 0, w, h };
  const frame = () => new Promise(res => requestAnimationFrame(res));
  for (let i = 0; i < 90; i++) { await frame(); r.draw(g, rect); }   // rozgrzewka: przenikania zakończone
  const run = async (frames, each) => {
    const cpu = [], dts = [];
    let renders0 = r.info().renders, last = performance.now();
    for (let i = 0; i < frames; i++) {
      await frame();
      const t = performance.now(); dts.push(t - last); last = t;
      each?.(i);
      const t0 = performance.now();
      r.draw(g, rect);
      cpu.push(performance.now() - t0);
    }
    const s = (a) => a.slice().sort((x, y) => x - y), q = (a, p) => +(s(a)[Math.floor(a.length * p)] ?? 0).toFixed(2);
    return { frames, renders: r.info().renders - renders0, drawMsMedian: q(cpu, 0.5), drawMsP95: q(cpu, 0.95), frameMsMedian: q(dts, 0.5), frameMsP95: q(dts, 0.95) };
  };
  const res = { device: [w, h], tiles: topo.count, arch: archId };
  // (1) bezczynność bez pogody: zaznaczone pole (blokada obrotu), zegar pogody stoi (pauza gry)
  r.setMode({ selectedTile: capital, lock: true });
  r._getWeatherRate = () => 0;
  res.idlePaused = await run(120);
  // (2) bezczynność z pogodą: chmury płyną (10 kl./s)
  r._getWeatherRate = () => 1;
  res.idleWeather = await run(120);
  // (3) auto-obrót (30 kl./s)
  r.setMode({ selectedTile: -1, lock: false });
  r.pointerLeave();
  for (let i = 0; i < 240; i++) { await frame(); r.draw(g, rect); if (r.info().spin === 'spin') break; }
  res.spin = await run(180);
  // (4) przeciąganie — render co klatkę
  r.dragStart(w / 2, h / 2, rect);
  res.drag = await run(180, (i) => r.pointerMove(w / 2 + 6 + i * 1.5, h / 2 + Math.sin(i / 20) * 40, rect));
  r.dragEnd();
  // (5) kursor nad kulą (siatka przy kursorze) — render tylko przy ruchu myszy
  res.hover = await run(180, (i) => r.pointerMove(w / 2 + Math.cos(i / 15) * 180, h / 2 + Math.sin(i / 15) * 120, rect));
  res.info = r.info();
  r.release();
  canvas.remove();
  return res;
}

window.__cs7a = { renderHeroSheet, renderSwapStrip, compileProbe, rendererProbe, measure, nearestTile };
