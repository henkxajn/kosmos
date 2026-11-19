// cs6b-sheet-page — moduł PRZEGLĄDARKI dla sondy `probe-cs6b-air.mjs` (ARC COLONY SPHERE, krok CS-6b; plan §3.7).
//
// Arkusze kontaktowe PRAWDZIWYMI shaderami gry: SurfaceShader (powierzchnia, pole v3) + SurfaceAirShader (chmury /
// zasłona + poświata limbu) na mapach z SurfaceField, światło jak w grze (lightFor z arkusza CS-6a). Do tego sonda
// kompilacji GLSL obu programów powietrza z kontrolą, która MUSI się nie skompilować.

import * as THREE from 'three';
import { SurfaceShader } from '../../renderer/SurfaceShader.js';
import { SurfaceAirShader } from '../../renderer/SurfaceAirShader.js';
import { resolveSurfaceLook, surfaceSeaLevelOf } from '../../utils/SurfacePaletteLogic.js';
import { resolveAirLook, substellarDirOf, starLockQuat } from '../../utils/SurfaceAirLogic.js';
import { bakeEquirect, LOD_SIZES } from '../../utils/SurfaceField.js';
import { ARCHETYPE_BY_ID } from '../../data/BodyArchetypes.js';
import { planetoidPaletteOf } from '../../utils/BodyArchetypeLogic.js';
import { mixSeed } from '../../utils/SeedMath.js';
import { fakeBody, lightFor, makeStage, finish, SHEET_ROWS } from './cs6a-sheet-page.js';

const SUN_SIDE = new THREE.Vector3(-0.93, 0.22, 0.30).normalize();   // światło z boku — terminator w kadrze
/** Klasa atmosfery ciała arkusza (w grze: zapisane pole ciała; reguły `match` archetypu). */
const ATMOSPHERE_OF = { terran: 'breathable', ocean: 'breathable', jungle: 'breathable', desert: 'thin', ice: 'thin', volcanic: 'thin',
  hothouse: 'dense', cryo_haze: 'dense', tidally_locked: 'thin', hazy_moon: 'dense' };

function airBody(archId, seed, extra = {}) {
  return fakeBody(archId, seed, { atmosphere: ATMOSPHERE_OF[archId] ?? 'none', ...extra });
}

function sharedFor(cls, sunPos) {
  const L = lightFor(cls);
  return { uSunPos: { value: sunPos }, uSunColor: { value: L.sun }, uAmbient: { value: L.ambient }, uTune: { value: [1, 1, 1, 1] } };
}

/** Materiał powierzchni z mapą (opcjonalnie wiersz archetypu podmieniony — arkusz A/B kraterów). */
function surfaceMaterial(body, cls, shared, opts = {}) {
  const look = resolveSurfaceLook(body, cls);
  if (!look) return null;
  const mat = SurfaceShader.createSurfaceMaterial(THREE, look, { logDepth: false, shared, surfaceSeed: body.surfaceSeed });
  const [w, h] = LOD_SIZES[opts.lod ?? (body.type === 'planetoid' ? 'planetoid' : 'body')];
  const arch = opts.arch ?? ARCHETYPE_BY_ID[body.bodyArchetype];
  const data = bakeEquirect(body.surfaceSeed, arch, { waterCoverage: body.waterCoverage ?? null, palette: body.type === 'planetoid' ? planetoidPaletteOf(body) : null }, w, h);
  SurfaceShader.applySurfaceMap(THREE, mat, { data, w, h }, surfaceSeaLevelOf(body), true);
  return mat;
}

/** Powłoki powietrza ciała (albo null) — te same materiały i promienie co ThreeRenderer._syncSharedAir. */
function airMeshes(body, shared, opts = {}) {
  const air = opts.noAir ? null : resolveAirLook(body);
  if (!air) return null;
  const mats = SurfaceAirShader.createAirMaterials(THREE, air, { logDepth: false, shared });
  if (opts.haze != null) SurfaceAirShader.setHazeOpacity(mats.shell, opts.haze);
  // Zegar pogody arkusza: `time` [s czasu pogody] → kąt dryfu + faza ewolucji; `freezeDrift` zostawia sam wiatr pasmowy i ewolucję.
  const t = opts.time ?? 0;
  SurfaceAirShader.setAirClock(mats.shell, opts.freezeDrift ? 0 : t * air.drift, air.weatherPhase + t * air.evolve);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(air.shellScale, 96, 64), mats.shell);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(air.haloScale, 64, 48), mats.halo);
  return { air, shell, halo };
}

function disposeAir(a) {
  if (!a) return;
  for (const m of [a.shell, a.halo]) { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); }
}

function drawBody(st, x, y, size, body, cls, opts = {}) {
  const sd = opts.sunDir ?? SUN_SIDE;
  const shared = sharedFor(cls, [sd.x * 1000, sd.y * 1000, sd.z * 1000]);
  const mat = surfaceMaterial(body, cls, shared, opts);
  if (!mat) return null;
  st.mesh.material = mat;
  st.mesh.rotation.set(opts.tilt ?? 0.22, opts.rotY ?? 0.6, 0.08);
  const a = airMeshes(body, shared, opts);
  if (a) { a.shell.rotation.copy(st.mesh.rotation);   // powłoka współobraca się z ciałem (jak w grze)
    st.scene.add(a.shell); st.scene.add(a.halo); }
  st.renderer.setScissorTest(true);
  st.renderer.setViewport(x, st.H - y - size, size, size);
  st.renderer.setScissor(x, st.H - y - size, size, size);
  st.renderer.render(st.scene, st.camera);
  mat.dispose();
  disposeAir(a);
  return { look: mat.userData.surfaceLook, air: a?.air ?? null };
}

const airLabel = (air) => (air ? `${air.variantA}+${air.variantB} ${air.blend.toFixed(2)} · haze ${air.hazeOpacity.toFixed(2)} · clouds ${air.cloudCoverage.toFixed(2)}` : 'airless — no shell');

/** cs6b-atmospheres: każdy archetyp z atmosferą i chmurami, gwiazda G, terminator w kadrze. */
export function renderAtmospheres(cell = 300) {
  const perRow = 10, top = 34, lab = 34;
  const blocks = Math.ceil(SHEET_ROWS.length / perRow);
  const W = perRow * cell, H = top + blocks * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 6.3);
  const labels = [];
  SHEET_ROWS.forEach(([archId, extra], i) => {
    const col = i % perRow, block = Math.floor(i / perRow);
    const x0 = col * cell, y0 = top + block * (cell + lab);
    const body = airBody(archId, mixSeed(0xC56B + i * 7919), extra ?? {});
    const r = drawBody(st, x0, y0 + lab, cell, body, 'G', { rotY: 0.6 + i * 0.37 });
    labels.push({ text: archId + (extra?.planetoidType ? ' · ' + extra.planetoidType : '') + (ATMOSPHERE_OF[archId] ? ' · ' + ATMOSPHERE_OF[archId] : ''), x: x0 + 6, y: y0 + 2, color: '#e6eef6' });
    labels.push({ text: airLabel(r?.air), x: x0 + 6, y: y0 + 17, font: '11px Consolas, monospace' });
  });
  return finish(st, labels, 'CS-6b · SurfaceAirShader · every archetype with its atmosphere + clouds · star G · light from the side (terminator in frame) · SurfaceField v3');
}

/** cs6b-clouds: terran / ocean / jungle × 6 ziaren — od rozrzuconych cumulusów po pasma burzowe; wzór z ziarna. */
export function renderCloudVariety(cell = 300) {
  const rows = ['terran', 'ocean', 'jungle', 'desert'], n = 6, top = 34, left = 90, lab = 18;
  const W = left + n * cell, H = top + rows.length * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 6.3);
  const labels = [];
  rows.forEach((archId, r) => {
    const y0 = top + r * (cell + lab);
    labels.push({ text: archId, x: 8, y: y0 + cell / 2, font: 'bold 14px Consolas, monospace', color: '#e6eef6' });
    for (let i = 0; i < n; i++) {
      const body = airBody(archId, mixSeed(0x7B22 + r * 131 + i * 104729), archId === 'desert' && i % 2 ? { atmosphere: 'breathable' } : {});
      const res = drawBody(st, left + i * cell, y0 + lab, cell, body, 'G', { rotY: 0.4 + i * 1.1, sunDir: new THREE.Vector3(-0.7, 0.3, 0.65).normalize() });
      labels.push({ text: `${airLabel(res?.air)} · band ${res?.air?.cloudBand.toFixed(2)}`, x: left + i * cell + 6, y: y0 + 2, font: '11px Consolas, monospace' });
    }
  });
  return finish(st, labels, 'CS-6b · clouds per body · coverage from the archetype, pattern / scale / banding / swirl from surfaceSeed · star G');
}

/**
 * cs6b-clouds-evolution: ten sam świat terran i ocean w 4 chwilach (ta sama kamera, powierzchnia nieruchoma) — chmury
 * zmieniają kształt; trzeci wiersz: sztywny dryf zamrożony, zostaje wiatr pasmowy (różne pasma w różne strony) + ewolucja.
 */
export function renderCloudEvolution(cell = 420) {
  const T = [0, 20, 40, 60];
  const rows = [['terran', 0x7B22 + 104729 * 3, 0], ['ocean', 0x7B22 + 131 + 104729 * 4, 0], ['terran', 0x7B22 + 104729 * 3, 0.011]];   // [archetyp, ziarno, obrót ciała rad/s]
  const n = 4, top = 34, left = 120, lab = 18;
  const W = left + n * cell, H = top + rows.length * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 6.3);
  const labels = [];
  rows.forEach(([archId, s, spin], r) => {
    const y0 = top + r * (cell + lab);
    labels.push({ text: archId, x: 8, y: y0 + cell / 2 - 10, font: 'bold 14px Consolas, monospace', color: '#e6eef6' });
    labels.push({ text: spin ? 'planet turning' : 'surface held', x: 8, y: y0 + cell / 2 + 10, font: '11px Consolas, monospace' });
    T.forEach((t, i) => {
      const body = airBody(archId, mixSeed(s));
      const res = drawBody(st, left + i * cell, y0 + lab, cell, body, 'G', { rotY: 0.9 + spin * t, time: t, sunDir: new THREE.Vector3(-0.55, 0.3, 0.78).normalize() });
      labels.push({ text: `t = ${t} s at normal speed · cycle ${(1 / (res?.air?.evolve ?? 1)).toFixed(0)} s${spin ? ' · planet turned ' + (spin * t).toFixed(2) + ' rad' : ''}`, x: left + i * cell + 6, y: y0 + 2, font: '11px Consolas, monospace', color: spin ? '#e0c080' : '#9fb4c8' });
    });
  });
  return finish(st, labels, 'CS-6b tuning #2 · clouds evolve · rows 1–2: same camera, surface held, 4 time steps · row 3: the planet turns — follow a continent: the cloud layer turns with the surface (winds and evolution are relative to it)');
}

/** cs6b-venus-titan: hothouse × 3 ziarna, cryo_haze × 3, hazy_moon × 3 + kolumna „hazeOpacity 0.35" (podgląd parametru CS-7). */
export function renderVenusTitan(cell = 380) {
  const rows = ['hothouse', 'cryo_haze', 'hazy_moon'], n = 3, top = 34, left = 110, lab = 18;
  const W = left + (n + 1) * cell, H = top + rows.length * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 6.3);
  const labels = [];
  rows.forEach((archId, r) => {
    const y0 = top + r * (cell + lab);
    labels.push({ text: archId, x: 8, y: y0 + cell / 2, font: 'bold 14px Consolas, monospace', color: '#e6eef6' });
    for (let i = 0; i <= n; i++) {
      const thin = i === n;
      const body = airBody(archId, mixSeed(0x9C33 + r * 977 + (thin ? 0 : i) * 104729));
      const res = drawBody(st, left + i * cell, y0 + lab, cell, body, 'G', { rotY: 0.5 + (thin ? 0 : i) * 1.3, haze: thin ? 0.35 : null });
      labels.push({ text: thin ? `seed of column 1 · hazeOpacity 0.35 (CS-7 thinning preview)` : `seed ${body.surfaceSeed.toString(16)} · ${airLabel(res?.air)}`,
        x: left + i * cell + 6, y: y0 + 2, font: '11px Consolas, monospace', color: thin ? '#e0c080' : '#9fb4c8' });
    }
  });
  return finish(st, labels, 'CS-6b · Venus deck (hothouse) · Titan haze (cryo_haze opaque, hazy_moon thinner / paler) · 3 seeds each · star G · last column: the per-body hazeOpacity parameter lowered');
}

/**
 * cs6b-tidally-locked: jedno ciało w 4 położeniach orbity — strona dzienna (środek „oka" pola) śledzi gwiazdę.
 * Orientacja liczona TĄ SAMĄ funkcją co w grze (starLockQuat + substellarDirOf). Dwa panele: bez atmosfery / z cienką.
 */
export function renderTidallyLocked(panel = 900) {
  const strip = panel / 4, top = 56;
  const W = panel * 2, H = top + panel + strip + 22;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x04060a, 1); renderer.clear();
  renderer.setScissorTest(true);
  const labels = [];
  const R = 2.75, PR = 0.6, DEG = [0, 90, 180, 270];
  const bodies = [airBody('tidally_locked', mixSeed(0x71DA), { atmosphere: 'none', tidallyLocked: true, type: 'planet' }),
    airBody('tidally_locked', mixSeed(0x71DB + 31337), { atmosphere: 'thin', tidallyLocked: true, type: 'planet' })];
  bodies.forEach((body, k) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 12.2, 4.6); camera.lookAt(0, 0, 0);
    const shared = sharedFor('K', [0, 0, 0]);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    scene.add(star);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.006, R + 0.006, 160), new THREE.MeshBasicMaterial({ color: 0x2a3a4c, side: THREE.DoubleSide }));
    ring.rotation.x = Math.PI / 2; scene.add(ring);
    const sub = substellarDirOf(body), made = [];
    DEG.forEach((deg) => {
      const a = (deg + 35) * Math.PI / 180, px = Math.cos(a) * R, pz = Math.sin(a) * R;
      const mat = surfaceMaterial(body, 'K', shared);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(PR, 96, 64), mat);
      const q = starLockQuat(sub, -px, -pz);
      mesh.quaternion.set(q[0], q[1], q[2], q[3]);
      const group = new THREE.Group(); group.position.set(px, 0, pz); group.add(mesh);
      const air = airMeshes(body, shared);
      if (air) { air.shell.scale.setScalar(PR); air.halo.scale.setScalar(PR); group.add(air.shell); group.add(air.halo); }
      scene.add(group); made.push({ mat, mesh, air, px, pz });
    });
    // Panel główny: widok z góry — oświetlona półkula zawsze od strony gwiazdy.
    const y0 = H - top - panel;
    renderer.setViewport(k * panel, y0, panel, panel); renderer.setScissor(k * panel, y0, panel, panel);
    renderer.render(scene, camera);
    // Pasek: to samo ciało widziane Z GWIAZDY w każdym z 4 położeń — obraz ma być ten sam (środek „oka" w środku tarczy).
    star.visible = false; ring.visible = false;
    const cam2 = new THREE.PerspectiveCamera(2 * Math.atan((PR * 1.22) / R) * 180 / Math.PI, 1, 0.1, 100);
    made.forEach((m, i) => {
      cam2.position.set(0, 0, 0); cam2.lookAt(m.px, 0, m.pz);
      renderer.setViewport(k * panel + i * strip, 0, strip, strip); renderer.setScissor(k * panel + i * strip, 0, strip, strip);
      renderer.render(scene, cam2);
      labels.push({ text: `seen from the star · orbit ${DEG[i]}°`, x: k * panel + i * strip + 6, y: top + panel + 4, font: '11px Consolas, monospace' });
    });
    for (const m of made) { m.mat.dispose(); m.mesh.geometry.dispose(); disposeAir(m.air); }
    labels.push({ text: `seed ${body.surfaceSeed.toString(16)} · atmosphere ${body.atmosphere} · substellar point (object space) = (${sub.map(v => v.toFixed(2)).join(', ')})`,
      x: k * panel + 10, y: 34, color: '#9fb4c8' });
  });
  const st = { canvas, renderer, W, H };
  return finish(st, labels, 'CS-6b · tidally locked · no axial spin — top view: the lit hemisphere always faces the star · strip: the same body seen from the star at 4 orbit positions (identical = the eye tracks the star) · star K');
}

/**
 * cs6b-moon-craters-ab: rocky_cratered i icy_cratered — gęstość kraterów dzisiejsza vs ≈ +40%, po 3 ziarna.
 * ⚠ Arkusz DECYZYJNY: wiersz „+40%" liczony z podmienionego wiersza archetypu tylko tutaj; domyślna wartość w
 *   BodyArchetypes NIE jest zmieniana.
 */
export function renderMoonCratersAB(cell = 360) {
  const archs = ['rocky_cratered', 'icy_cratered'], n = 3, top = 34, left = 150, lab = 18, gap = 16;
  const W = left + n * cell * 2 + gap, H = top + archs.length * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 5.6);
  const labels = [];
  archs.forEach((archId, r) => {
    const base = ARCHETYPE_BY_ID[archId];
    // D-CS-22: B (≈ +40%) jest domyślne — `base` to B, a A odtwarza poprzednią gęstość (÷ 1.4).
    const sparse = { ...base, id: archId + '_prev', field: { ...base.field, recipe: archId, craterDensity: +(base.field.craterDensity / 1.4).toFixed(2) } };
    const y0 = top + r * (cell + lab);
    labels.push({ text: archId, x: 8, y: y0 + cell / 2 - 10, font: 'bold 14px Consolas, monospace', color: '#e6eef6' });
    labels.push({ text: `density ${sparse.field.craterDensity} | ${base.field.craterDensity}`, x: 8, y: y0 + cell / 2 + 10, font: '11px Consolas, monospace' });
    for (let v = 0; v < 2; v++) for (let i = 0; i < n; i++) {
      const body = fakeBody(archId, mixSeed(0xAB40 + r * 613 + i * 104729));
      const x = left + (v * n + i) * cell + v * gap;
      drawBody(st, x, y0 + lab, cell, body, 'G', { rotY: 0.7 + i * 1.9, arch: v ? base : sparse, sunDir: new THREE.Vector3(-0.8, 0.3, 0.52).normalize() });
      labels.push({ text: `${v ? 'B = new default (D-CS-22)' : 'A: previous default (÷ 1.4)'} · seed ${body.surfaceSeed.toString(16)}`, x: x + 6, y: y0 + 2, color: v ? '#e0c080' : '#9fb4c8' });
    }
  });
  return finish(st, labels, 'CS-6b · moon craters A/B · D-CS-22 signed: B = new default (≈ +40% density, SurfaceField v4) · left 3 = A previous default · right 3 = B · same seeds, same light');
}

/** cs6b-field-v3: przed / po poprawkach pola nie da się pokazać w jednym module — arkusz pokazuje STAN v3: terran × pasma wody, ice × 6 ziaren, barren × 6. */
export function renderFieldV3(cell = 300) {
  const rows = [['terran', [0.22, 0.4, 0.55, 0.7, 0.8, 0.9]], ['ice', null], ['barren', null]], n = 6, top = 34, left = 90, lab = 18;
  const W = left + n * cell, H = top + rows.length * (cell + lab);
  const st = makeStage(W, H);
  st.camera.position.set(0, 0, 5.6);
  const labels = [];
  rows.forEach(([archId, waters], r) => {
    const y0 = top + r * (cell + lab);
    labels.push({ text: archId, x: 8, y: y0 + cell / 2, font: 'bold 14px Consolas, monospace', color: '#e6eef6' });
    for (let i = 0; i < n; i++) {
      const body = fakeBody(archId, mixSeed(0xF1E3 + r * 131 + i * 104729), waters ? { waterCoverage: waters[i] } : {});
      drawBody(st, left + i * cell, y0 + lab, cell, body, 'G', { rotY: 0.4 + i * 1.1, noAir: true, lod: 'hero', sunDir: new THREE.Vector3(-0.7, 0.3, 0.65).normalize() });
      labels.push({ text: `seed ${body.surfaceSeed.toString(16)}` + (waters ? ` · water ${waters[i].toFixed(2)}` : ''), x: left + i * cell + 6, y: y0 + 2 });
    }
  });
  return finish(st, labels, 'CS-6b · SurfaceField v3 without air · terran: mountains = rock where the classifier says mountains, snow = peaks (Finding 771) · ice: per-seed structure · barren: regional crater density');
}

/**
 * Sonda kompilacji GLSL: oba programy powietrza (powłoka + poświata), z chunkami log depth i bez, MUSZĄ się
 * skompilować i narysować niepusty piksel; kontrola (wstrzyknięty śmieć) MUSI zgłosić błąd.
 */
export function compileProbe() {
  const out = [];
  for (const which of ['shell', 'halo']) for (const logDepth of [false, true]) for (const broken of [false, true]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const renderer = new THREE.WebGLRenderer({ canvas, logarithmicDepthBuffer: logDepth });
    const errors = [];
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      errors.push(String(gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || 'link error').slice(0, 240));
    };
    const body = airBody('hothouse', 12345);
    const shared = { uSunPos: { value: [0, 0, which === 'halo' ? -1000 : 1000] }, uSunColor: { value: [0.9, 0.9, 0.9] }, uAmbient: { value: [0, 0, 0] } };
    const mats = SurfaceAirShader.createAirMaterials(THREE, resolveAirLook(body), { logDepth, shared });
    const mat = mats[which];
    if (broken) mat.fragmentShader = mat.fragmentShader.replace('vec3 N = normalize(vWN);', 'vec3 N = normalize(vWN); cs6b_broken_control;');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4);
    // Poświata (BackSide) świeci w pierścieniu poza tarczą — piksel próbny bierzemy z limbu, powłoki ze środka.
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(which === 'halo' ? 1.9 : 1, 32, 16), mat));
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    let lit = 0;
    for (let x = 1; x < 64; x += 2) { gl.readPixels(x, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); lit = Math.max(lit, px[0] + px[1] + px[2]); }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.push({ which, logDepth, broken, errors, lit, hasLogDepthChunk: mat.fragmentShader.includes('USE_LOGDEPTHBUF'),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' });
    mats.shell.dispose(); mats.halo.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
  return out;
}

window.__cs6b = { renderAtmospheres, renderCloudVariety, renderCloudEvolution, renderVenusTitan, renderTidallyLocked, renderMoonCratersAB, renderFieldV3, compileProbe };
