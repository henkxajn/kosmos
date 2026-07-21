// tmp_holotable_cam_smoke.mjs — smoke H0: czysta matematyka HolotableCamera
//   node tmp_holotable_cam_smoke.mjs
//
// Zero three / zero DOM — moduł ma być headless-clean. Testuje: orbitPosition
// (regresja vs stara formuła setCameraOrbit), clampPitch, panScreenToWorld (skala
// z dist / viewportu, obrót bazy z yaw), riserEndpoints, oraz brak importu three.

import { readFileSync } from 'node:fs';
import {
  PITCH_MIN, PITCH_MAX, DEFAULT_OBLIQUE_PITCH,
  clampPitch, orbitPosition, panScreenToWorld, riserEndpoints,
} from './src/renderer/HolotableCamera.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Referencyjna STARA formuła z setCameraOrbit (lustro do regresji)
function oldOrbit(yaw, pitch, dist, target = null) {
  const tx = target?.x ?? 0, ty = target?.y ?? 0, tz = target?.z ?? 0;
  const ph = Math.max(0.12, Math.min(Math.PI - 0.12, pitch));
  return { x: tx + dist * Math.sin(ph) * Math.cos(yaw), y: ty + dist * Math.cos(ph), z: tz + dist * Math.sin(ph) * Math.sin(yaw) };
}

// ── T1: clampPitch ──
ok(clampPitch(0) === PITCH_MIN, 'T1 clampPitch(0) = PITCH_MIN');
ok(clampPitch(Math.PI) === PITCH_MAX, 'T1 clampPitch(π) = PITCH_MAX');
ok(clampPitch(1.0) === 1.0, 'T1 clampPitch(1.0) = 1.0 (w zakresie)');
ok(DEFAULT_OBLIQUE_PITCH > PITCH_MIN && DEFAULT_OBLIQUE_PITCH < PITCH_MAX, 'T1 DEFAULT_OBLIQUE_PITCH w zakresie');

// ── T2: orbitPosition == stara formuła (regresja behaviour-identical) ──
{
  const cases = [
    [0.6, 0.92, 40, null],
    [1.7, 0.5, 12, { x: 5, y: 0, z: -3 }],
    [-2.1, 0.05, 80, { x: 0, y: 0, z: 0 }],   // pitch < MIN → clamp obie strony
    [3.3, 3.10, 25, { x: 1, y: 2, z: 3 }],    // pitch > MAX → clamp
  ];
  let allMatch = true;
  for (const [y, p, d, t] of cases) {
    const a = orbitPosition(y, p, d, t), b = oldOrbit(y, p, d, t);
    if (!near(a.x, b.x) || !near(a.y, b.y) || !near(a.z, b.z)) allMatch = false;
  }
  ok(allMatch, 'T2 orbitPosition zgodne ze starą formułą setCameraOrbit (wszystkie przypadki)');
}

// ── T3: orbitPosition — target offset stosowany ──
{
  const noT = orbitPosition(0, Math.PI / 2, 40, null);
  ok(near(noT.x, 40) && near(noT.y, 0, 1e-6) && near(noT.z, 0, 1e-6), 'T3 yaw0/pitchπ2/dist40 → (40,~0,~0)');
  const withT = orbitPosition(0, Math.PI / 2, 40, { x: 5, y: 1, z: 7 });
  ok(near(withT.x, 45) && near(withT.y, 1, 1e-6) && near(withT.z, 7, 1e-6), 'T3 target offset dodany do pozycji');
}

// ── T4: panScreenToWorld — skala rośnie z dist, maleje z viewportHpx ──
{
  const a = panScreenToWorld(10, 0, { dist: 40, yaw: 0, viewportHpx: 600 });
  const b = panScreenToWorld(10, 0, { dist: 80, yaw: 0, viewportHpx: 600 });
  const magA = Math.hypot(a.dx, a.dz), magB = Math.hypot(b.dx, b.dz);
  ok(near(magB, magA * 2, 1e-9), 'T4 podwojenie dist → podwojenie przesunięcia');
  const c = panScreenToWorld(10, 0, { dist: 40, yaw: 0, viewportHpx: 1200 });
  ok(near(Math.hypot(c.dx, c.dz), magA / 2, 1e-9), 'T4 podwojenie viewportHpx → połowa przesunięcia');
  ok(magA > 0, 'T4 niezerowe przesunięcie przy niezerowym drag');
}

// ── T5: panScreenToWorld — obrót yaw obraca bazę o 90° (dz↔dx) ──
{
  const at0  = panScreenToWorld(10, 0, { dist: 40, yaw: 0, viewportHpx: 600 });
  const at90 = panScreenToWorld(10, 0, { dist: 40, yaw: Math.PI / 2, viewportHpx: 600 });
  // yaw=0: czyste dz; yaw=π/2: czyste dx (baza obrócona)
  ok(Math.abs(at0.dx) < 1e-9 && Math.abs(at0.dz) > 1e-9, 'T5 yaw=0 → przesunięcie wzdłuż dz');
  ok(Math.abs(at90.dz) < 1e-9 && Math.abs(at90.dx) > 1e-9, 'T5 yaw=π/2 → przesunięcie wzdłuż dx (obrót bazy)');
  ok(near(Math.hypot(at0.dx, at0.dz), Math.hypot(at90.dx, at90.dz)), 'T5 magnituda niezmienna przy obrocie yaw');
}

// ── T6: panScreenToWorld — invertX/invertY odwraca znak ──
{
  const base = panScreenToWorld(10, 5, { dist: 40, yaw: 0.3, viewportHpx: 600 });
  const invX = panScreenToWorld(10, 5, { dist: 40, yaw: 0.3, viewportHpx: 600, invertX: true });
  ok(!near(base.dx, invX.dx) || !near(base.dz, invX.dz), 'T6 invertX zmienia wynik');
}

// ── T7: riserEndpoints — base na dysku (Y=0), top na wysokości gz ──
{
  const r = riserEndpoints(3, 7, 2);
  ok(r.base.x === 3 && r.base.y === 0 && r.base.z === 7, 'T7 base = (gx, 0, gy)');
  ok(r.top.x === 3 && r.top.y === 2 && r.top.z === 7, 'T7 top = (gx, gz, gy)');
  const r0 = riserEndpoints(1, 1, 0);
  ok(r0.base.y === 0 && r0.top.y === 0, 'T7 gz=0 → słupek zerowej długości (home na dysku)');
}

// ── T8: headless-clean — moduł NIE importuje three ani DOM ──
{
  const src = readFileSync(new URL('./src/renderer/HolotableCamera.js', import.meta.url), 'utf8');
  ok(!/from ['"]three/.test(src) && !/import\s+\*\s+as\s+THREE/.test(src), 'T8 brak importu three');
  ok(!/document|window/.test(src.replace(/\/\/.*$/gm, '')), 'T8 brak odwołań do DOM (poza komentarzami)');
}

console.log(`\ntmp_holotable_cam_smoke: ${pass}/${pass + fail} PASS` + (fail ? ` (${fail} FAIL)` : ''));
process.exit(fail ? 1 : 0);
