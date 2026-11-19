// cs6a-sheet-page — moduł PRZEGLĄDARKI dla sondy `probe-cs6a-shader.mjs` (ARC COLONY SPHERE, krok CS-6a; plan §3.6).
//
// Ładowany przez wirtualną stronę sondy (importmap `three` → src/lib/three.module.js). Rysuje arkusze kontaktowe
// PRAWDZIWYM shaderem gry (src/renderer/SurfaceShader.js) na mapach LOD z SurfaceField (256×128 / 128×64 — te same,
// które dostaje mapa układu) i wykonuje sondę kompilacji GLSL z kontrolą, która MUSI się nie skompilować.
// Światło jak w grze: barwa gwiazdy STAR_TYPES × 2.8 × L^0.22 → SurfaceShader.surfaceSunColor; ACES, ekspozycja 1.12.

import * as THREE from 'three';
import { SurfaceShader } from '../../renderer/SurfaceShader.js';
import { resolveSurfaceLook, surfaceSeaLevelOf } from '../../utils/SurfacePaletteLogic.js';
import { bakeEquirect, LOD_SIZES } from '../../utils/SurfaceField.js';
import { ARCHETYPE_BY_ID } from '../../data/BodyArchetypes.js';
import { planetoidPaletteOf } from '../../utils/BodyArchetypeLogic.js';
import { STAR_TYPES } from '../../config/GameConfig.js';
import { mixSeed } from '../../utils/SeedMath.js';

// Lustro stałych ThreeRenderer (tylko arkusz): baza PointLighta, wykładnik jasności, ambient.
const LIGHT_BASE = 2.8, LUM_EXP = 0.22, AMBIENT_HEX = 0x101a26, AMBIENT_COOL_HEX = 0x0a1c4d, AMBIENT_COOL_MIX = 0.6, AMBIENT_INT = 0.4;
const SUN_DIR = new THREE.Vector3(-0.78, 0.32, 0.54).normalize();

export function lightFor(cls) {
  const st = STAR_TYPES[cls] ?? STAR_TYPES.G;
  const c = new THREE.Color(st.color);
  const sun = SurfaceShader.surfaceSunColor(c.r, c.g, c.b, LIGHT_BASE * Math.pow(Math.max(st.luminosity ?? 1, 1e-6), LUM_EXP));
  const a = new THREE.Color(AMBIENT_HEX);
  if (cls === 'M' || cls === 'K') a.lerp(new THREE.Color(AMBIENT_COOL_HEX), AMBIENT_COOL_MIX);
  const k = AMBIENT_INT / Math.PI;
  return { sun, ambient: [a.r * k, a.g * k, a.b * k] };
}

export function fakeBody(archId, seed, extra = {}) {
  const arch = ARCHETYPE_BY_ID[archId];
  const s = seed >>> 0;
  return {
    id: archId + '_' + s, type: arch.family, bodyArchetype: archId, surfaceSeed: s,
    waterCoverage: archId === 'terran' ? 0.45 + (mixSeed(s ^ 0x5a17) / 4294967296) * 0.35 : null, ...extra,
  };
}

export function makeStage(W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x04060a, 1);
  renderer.clear();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  camera.position.set(0, 0, 5.9);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64));
  scene.add(mesh);
  return { canvas, renderer, scene, camera, mesh, W, H };
}

function drawCell(st, x, y, size, body, cls, rotY = 0.6, opts = {}) {
  const look = resolveSurfaceLook(body, cls);
  if (!look) return null;
  const L = lightFor(cls);
  const sd = opts.sunDir ?? SUN_DIR;
  const shared = {
    uSunPos: { value: [sd.x * 1000, sd.y * 1000, sd.z * 1000] },
    uSunColor: { value: L.sun }, uAmbient: { value: L.ambient }, uTune: { value: [1, 1, 1, 1] },
  };
  const mat = SurfaceShader.createSurfaceMaterial(THREE, look, { logDepth: false, shared, surfaceSeed: body.surfaceSeed });
  const [w, h] = LOD_SIZES[opts.lod ?? (body.type === 'planetoid' ? 'planetoid' : 'body')];
  const arch = ARCHETYPE_BY_ID[body.bodyArchetype];
  const data = bakeEquirect(body.surfaceSeed, arch, { waterCoverage: body.waterCoverage ?? null, palette: body.type === 'planetoid' ? planetoidPaletteOf(body) : null }, w, h);
  SurfaceShader.applySurfaceMap(THREE, mat, { data, w, h }, surfaceSeaLevelOf(body), true);
  st.mesh.material = mat;
  st.mesh.rotation.set(opts.tilt ?? 0.22, rotY, 0.08);
  st.renderer.setScissorTest(true);
  st.renderer.setViewport(x, st.H - y - size, size, size);
  st.renderer.setScissor(x, st.H - y - size, size, size);
  st.renderer.render(st.scene, st.camera);
  mat.dispose();
  return look;
}

export function finish(st, labels, title) {
  const out = document.createElement('canvas');
  out.width = st.W; out.height = st.H;
  const g = out.getContext('2d');
  g.drawImage(st.canvas, 0, 0);
  g.textBaseline = 'top';
  for (const l of labels) {
    g.font = l.font ?? '12px Consolas, monospace';
    g.fillStyle = l.color ?? '#9fb4c8';
    g.fillText(l.text, l.x, l.y);
  }
  if (title) { g.font = 'bold 15px Consolas, monospace'; g.fillStyle = '#e6eef6'; g.fillText(title, 10, 8); }
  const gl = st.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  st.renderer.dispose();
  return { png: out.toDataURL('image/png'), gpu, w: st.W, h: st.H };
}

/** Wiersze arkusza archetypów: każdy archetyp powierzchni (planetoida × 3 typy). */
export const SHEET_ROWS = [
  ['terran'], ['ocean'], ['jungle'], ['desert'], ['ice'], ['volcanic'], ['hothouse'], ['cryo_haze'], ['scorched'], ['barren'],
  ['tidally_locked'], ['rocky_cratered'], ['volcanic_moon'], ['icy_cracked'], ['icy_cratered'], ['hazy_moon'],
  ['planetoid', { planetoidType: 'metallic' }], ['planetoid', { planetoidType: 'carbonaceous' }], ['planetoid', { planetoidType: 'silicate' }],
  ['planetoid_icy'],
];

/** cs6a-archetypes: każdy archetyp × klasa gwiazdy M / G / F (to samo ziarno w kolumnie → widać sam wpływ gwiazdy). */
export function renderArchetypes(cell = 200) {
  const perRow = 10, classes = ['M', 'G', 'F'], top = 34, lab = 30;
  const blocks = Math.ceil(SHEET_ROWS.length / perRow);
  const W = perRow * cell + 30, H = top + blocks * (classes.length * cell + lab + 8);
  const st = makeStage(W, H);
  const labels = [];
  SHEET_ROWS.forEach(([archId, extra], i) => {
    const col = i % perRow, block = Math.floor(i / perRow);
    const x0 = 30 + col * cell, y0 = top + block * (classes.length * cell + lab + 8);
    const body = fakeBody(archId, mixSeed(0xC56A + i * 7919), extra ?? {});
    labels.push({ text: archId + (extra?.planetoidType ? ' · ' + extra.planetoidType : ''), x: x0 + 6, y: y0 + 2, color: '#e6eef6' });
    classes.forEach((cls, r) => {
      const look = drawCell(st, x0, y0 + lab + r * cell, cell, body, cls, 0.6 + i * 0.37);
      if (col === 0) labels.push({ text: cls, x: 8, y: y0 + lab + r * cell + cell / 2 - 8, font: 'bold 16px Consolas, monospace', color: '#e6eef6' });
      if (r === 0 && look) labels.push({ text: look.variantA + '+' + look.variantB + ' ' + look.blend.toFixed(2), x: x0 + 6, y: y0 + 15 });
    });
  });
  return finish(st, labels, 'CS-6a · SurfaceShader · every surface archetype × star class M / G / F · map LOD 256×128 (planetoid 128×64) · same seed per column');
}

/** cs6a-variety: 4 częste archetypy × 6 ziaren, gwiazda G — dowód „żadne dwa takie same". */
export function renderVariety(cell = 290) {
  const rows = ['ice', 'desert', 'rocky_cratered', 'terran'], n = 6, top = 34, left = 120, lab = 18;
  const W = left + n * cell, H = top + rows.length * (cell + lab);
  const st = makeStage(W, H);
  const labels = [];
  rows.forEach((archId, r) => {
    labels.push({ text: archId, x: 8, y: top + r * (cell + lab) + cell / 2, font: 'bold 14px Consolas, monospace', color: '#e6eef6' });
    for (let i = 0; i < n; i++) {
      const body = fakeBody(archId, mixSeed(0x7A11 + r * 131 + i * 104729));
      const y0 = top + r * (cell + lab);
      const look = drawCell(st, left + i * cell, y0 + lab, cell, body, 'G', 0.4 + i * 1.1);
      if (look) labels.push({ text: 'seed ' + body.surfaceSeed.toString(16) + ' · ' + look.variantA + '+' + look.variantB + ' ' + look.blend.toFixed(2), x: left + i * cell + 6, y: y0 + 2 });
    }
  });
  return finish(st, labels, 'CS-6a · per-body colour variety · 4 archetypes × 6 seeds · star G · palette = variant A + blend of variant B + seed jitter');
}

/**
 * cs6a-terran-closeup (strojenie §3.6.1): 6 ziaren terran — po dwa z każdego pasma wody (continental / balanced /
 * oceanic) — w zbliżeniu, mapa bohatera 1024×512 (ta, którą gra podmienia na zbliżeniu), gwiazda G i K, światło z boku
 * (terminator w kadrze).
 */
export function renderTerranCloseup(cell = 420) {
  const waters = [0.22, 0.36, 0.48, 0.60, 0.74, 0.86], bands = ['continental', 'continental', 'balanced', 'balanced', 'oceanic', 'oceanic'];
  const classes = ['G', 'K'], top = 34, left = 30, lab = 18;
  const W = left + waters.length * cell, H = top + classes.length * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 5.35);
  const sunDir = new THREE.Vector3(-0.93, 0.22, 0.30).normalize();
  const labels = [];
  classes.forEach((cls, r) => {
    const y0 = top + r * (cell + lab);
    labels.push({ text: cls, x: 8, y: y0 + lab + cell / 2 - 8, font: 'bold 16px Consolas, monospace', color: '#e6eef6' });
    waters.forEach((wc, i) => {
      const body = fakeBody('terran', mixSeed(0x7E44 + i * 15485863), { waterCoverage: wc });
      const look = drawCell(st, left + i * cell, y0 + lab, cell, body, cls, 0.9 + i * 1.3, { lod: 'hero', sunDir, tilt: 0.30 });
      if (look) labels.push({ text: bands[i] + ' · water ' + wc.toFixed(2) + ' · ' + look.variantA + '+' + look.variantB + ' ' + look.blend.toFixed(2), x: left + i * cell + 6, y: y0 + 2 });
    });
  });
  return finish(st, labels, 'CS-6a tuning · terran close-up · 6 seeds × water bands · hero map 1024×512 · star G / K · terminator in frame');
}

/**
 * Sonda kompilacji GLSL: program gry (z chunkami log depth i bez) MUSI się skompilować i narysować oświetlony piksel;
 * kontrola (ten sam fragment z wstrzykniętym śmieciem) MUSI zgłosić błąd — inaczej sonda niczego nie mierzy.
 */
export function compileProbe() {
  const out = [];
  for (const logDepth of [false, true]) for (const broken of [false, true]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const renderer = new THREE.WebGLRenderer({ canvas, logarithmicDepthBuffer: logDepth });
    const errors = [];
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      errors.push(String(gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || 'link error').slice(0, 240));
    };
    const body = fakeBody('terran', 12345);
    const mat = SurfaceShader.createSurfaceMaterial(THREE, resolveSurfaceLook(body, 'G'), { logDepth, surfaceSeed: body.surfaceSeed,
      shared: { uSunPos: { value: [0, 0, 1000] }, uSunColor: { value: [0.9, 0.9, 0.9] }, uAmbient: { value: [0, 0, 0] }, uTune: { value: [1, 1, 1, 1] } } });
    if (broken) mat.fragmentShader = mat.fragmentShader.replace('vec3 alb;', 'vec3 alb; cs6a_broken_control;');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat));
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.push({ logDepth, broken, errors, pixel: Array.from(px), hasLogDepthChunk: mat.fragmentShader.includes('USE_LOGDEPTHBUF'),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' });
    mat.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
  return out;
}

window.__cs6a = { renderArchetypes, renderVariety, renderTerranCloseup, compileProbe };
