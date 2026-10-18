// ═══════════════════════════════════════════════════════════════════════════════
// combat_ring_subtle_smoke — KEEPER kroku C6 (POLISH P2b CLOSE, CP27): pierścień starcia SUBTELNY
// Rejestr: `docs/design/POLISH_PLAN.md` §12.9 (bramka P2B) i §13 (P2b CLOSE).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: słowa właściciela z bramki P2B (2026-10-18): „wszystko gra i pasuje, poza wielkością pierścienia — za duży
//   i zbyt mocny, powinien być tylko subtelny i wąski, aby nie zasłaniał modeli; pierścień pulsuje w dużym zoomie, to psuje
//   imersję”. Dawniej: pas `RingGeometry(0.25, 0.32)` w rozmiarze ŚWIATA (przy bliskim kadrze ~100 px szerokości), krycie
//   i skala z sinusa zegara REALNEGO (krycie 0,05–0,5, skala 0,9–1,1 — puls).
// KSZTAŁT (CP27): cienka linia o STAŁEJ szerokości na ekranie (`ENGAGEMENT_RING.WIDTH_PX`, ~1,5 px przy każdym
//   zbliżeniu), stałe krycie ~0,3, BEZ pulsu; promień bez zmian (środek dawnego pasa 0,25–0,32), pierścień w środku
//   uczestników (P2b-1) i ukryty przy „Obserwuj” (CP14, keeper P2a — bez przecelowania).
// ⚠ `ThreeRenderer` nie importuje się pod node (goły `three` → stub) ⇒ keeper WYCIĄGA ze źródła prawdziwe metody znacznika
//   (`_upsertEngagementMarker`, `_tickEngagementMarkers`, `_disposeEngagementMarker`, `_viewDepth`) i wykonuje je na
//   PRAWDZIWYM Three.js (`src/lib/three.module.js`, r171) z atrapą `this` i `window`; szerokość linii — rzut prawdziwą
//   kamerą (PerspectiveCamera 55°, ekran 1600 × 900, jak sonda P2b).
//
// PINY:
//   K0  KONTROLA: cztery metody znalezione i wykonywalne; prawdziwy Three.js
//   K1  KONTROLA przyrządu: dawny pas świata (0,25–0,32) przy bliskim kadrze mierzy > 2 px, przy dalekim < 2 px (pomiar
//       potrafi być czerwony i zależy od dystansu)
//   T1  ≥ 60 klatek przy każdym z trzech dystansów (60 / 2 / 0,5 j.): krycie i skala STAŁE z klatki na klatkę (bez pulsu)
//   T2  krycie ≤ 0,35 i ≥ 0,2 (CP27: ~0,3)
//   T3  szerokość linii na ekranie ≤ 2 px przy każdym dystansie (i ≥ 1 px — linia widoczna), stała z klatki na klatkę
//   T4  promień bez zmian: środek pasa 0,285 j. (± 0,01) w każdej klatce
//   T5  ukryty przy „Obserwuj”: wykonanie (`_watch` → niewidoczny, bez — widoczny) + ponowne użycie kontroli P2a
//       (`combat_watch_frame_smoke` T11i — keeper bez zmian, proces potomny)
//   T6  źródło: synchronizacja bez zegara realnego i sinusa, szerokość z `engagementRingBand`, stałe z `ENGAGEMENT_RING`
//   T7  `engagementRingBand` (czysta funkcja): szerokość świata = WIDTH_PX · świat-na-piksel w głębi KAŻDEGO wierzchołka
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import * as THREE              from '../../lib/three.module.js';
import * as FX                 from '../../utils/VesselFxLogic.js';
import { readFileSync }        from 'node:fs';
import { execFileSync }        from 'node:child_process';
import { fileURLToPath }       from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const W = 1600, H = 900;              // ekran sondy P2b
const RADIUS_MID = (0.25 + 0.32) / 2; // środek dawnego pasa — promień bez zmian (CP27)
const DISTS = [60, 2, 0.5];           // j.: kadr układu / auto-fokus / bliski kadr („Obserwuj”, min 0,4)
const FRAMES = 60;

// ── wyciągnięcie prawdziwych metod ze źródła ────────────────────────────────────
const TR = readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const WORLD_SCALE = Number((TR.match(/const WORLD_SCALE\s*=\s*([\d.]+)/) ?? [])[1]);
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  const params = TR.slice(TR.indexOf('(', i) + 1, sigEnd);
  const end = TR.indexOf('\n  }\n', sigEnd);
  return { params, body: TR.slice(sigEnd + 4, end), text: TR.slice(i + 1, end) };
}
const NAMES = ['THREE', 'S', 'planEngagementMarkers', 'ENGAGEMENT_BURST_TTL_MS', 'ENGAGEMENT_RING', 'engagementRingBand',
  '_WATCH_V', '_RING_P', 'window', 'performance'];
const S = (v) => v / WORLD_SCALE;
function build(name, win) {
  const m = methodOf(name);
  if (!m) return null;
  try {
    // eslint-disable-next-line no-new-func
    return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(THREE, S, FX.planEngagementMarkers,
      FX.ENGAGEMENT_BURST_TTL_MS, FX.ENGAGEMENT_RING, FX.engagementRingBand, new THREE.Vector3(), new THREE.Vector3(), win,
      performance);
  } catch (e) { console.log('    (budowa ' + name + ': ' + e.message + ')'); return null; }
}

// ── atrapa renderera: jedno aktywne starcie DSCS w oglądanym układzie, środek uczestników stały ─────────────────
const CENTRE = { x: 3.1, y: 0.3, z: -1.7 };
function makeRenderer() {
  const enc = { id: 'enc_c6', isActive: true, location: { systemId: 'sys_home', point: { x: 31, y: -17 } } };
  const win = { innerWidth: W, innerHeight: H,
    KOSMOS: { activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => [enc], _activeEncounters: new Map([[enc.id, enc]]) } } };
  const R = {
    _engagementMarkers: new Map(), scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(55, W / H, 0.001, 5000),
    _clock: { t: 0, getElapsedTime() { return this.t; } },
    _watch: null,
    _engagementCentre: () => ({ ...CENTRE }),
  };
  for (const n of ['_upsertEngagementMarker', '_tickEngagementMarkers', '_disposeEngagementMarker', '_viewDepth']) R[n] = build(n, win);
  return { R, enc };
}
function placeCamera(cam, d, elevDeg = 50) {
  const el = elevDeg * Math.PI / 180;
  cam.position.set(CENTRE.x, CENTRE.y + d * Math.sin(el), CENTRE.z + d * Math.cos(el));
  cam.lookAt(CENTRE.x, CENTRE.y, CENTRE.z);
  cam.updateMatrixWorld(true);
}
// Pomiar pasa: pary wierzchołków (okrąg wewnętrzny i zewnętrzny, kolejność `RingGeometry` z phiSegments = 1) w świecie
// (macierz mesha — skala pulsu wliczona), rzut kamerą → szerokość [px]; środek pasa → promień [j.].
function measure(mesh, cam) {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position; const n = pos.count / 2;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const centre = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  let maxPx = 0, minR = Infinity, maxR = 0;
  for (let i = 0; i < n; i++) {
    a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, n + i).applyMatrix4(mesh.matrixWorld);
    const r = c.copy(a).add(b).multiplyScalar(0.5).distanceTo(centre); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    const da = -a.clone().applyMatrix4(cam.matrixWorldInverse).z, db = -b.clone().applyMatrix4(cam.matrixWorldInverse).z;
    if (!(da > 0) || !(db > 0)) continue;
    const pa = a.clone().project(cam), pb = b.clone().project(cam);
    maxPx = Math.max(maxPx, Math.hypot((pa.x - pb.x) * W / 2, (pa.y - pb.y) * H / 2));
  }
  return { maxPx, minR, maxR };
}

// ═══ K0 ═══════════════════════════════════════════════════════════════════════
header('K0  KONTROLA: metody znacznika wyciągnięte ze źródła i wykonywalne na prawdziwym Three.js');
const { R, enc } = makeRenderer();
const methodsOk = ['_upsertEngagementMarker', '_tickEngagementMarkers', '_disposeEngagementMarker', '_viewDepth'].every((n) => typeof R[n] === 'function');
assert(methodsOk && Number.isFinite(WORLD_SCALE) && typeof THREE.RingGeometry === 'function' && /^1[5-9]\d$/.test(THREE.REVISION),
  `K0 cztery metody z \`ThreeRenderer.js\` zbudowane, WORLD_SCALE ${WORLD_SCALE}, Three.js r${THREE.REVISION}`);

// ═══ K1 ═══════════════════════════════════════════════════════════════════════
header('K1  KONTROLA przyrządu: dawny pas świata 0,25–0,32 — szerokość zależy od dystansu i potrafi przekroczyć 2 px');
{
  const ref = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 36), new THREE.MeshBasicMaterial());
  ref.rotation.x = -Math.PI / 2; ref.position.set(CENTRE.x, CENTRE.y, CENTRE.z);
  const cam = new THREE.PerspectiveCamera(55, W / H, 0.001, 5000);
  placeCamera(cam, 0.5); const near = measure(ref, cam).maxPx;
  placeCamera(cam, 60); const far = measure(ref, cam).maxPx;
  assert(near > 2 && far < 2, `K1 dawny pas: bliski kadr ${near.toFixed(1)} px (> 2), kadr układu ${far.toFixed(2)} px (< 2)`);
}

// ═══ T1–T4 ═══════════════════════════════════════════════════════════════════
header(`T1–T4  ${FRAMES} klatek przy każdym dystansie kamery (${DISTS.join(' / ')} j.), zegar realny płynie 16 ms na klatkę`);
const rows = [];
if (methodsOk) {
  let now = 10_000, t = 0;
  for (const d of DISTS) {
    placeCamera(R.camera, d);
    const op = [], sc = [], px = [], rad = [];
    for (let f = 0; f < FRAMES; f++) {
      t += 0.016; now += 16; R._clock.t = t;
      R._tickEngagementMarkers(now);
      const e = R._engagementMarkers.get(enc.id);
      if (!e) continue;
      op.push(e.mat.opacity); sc.push(e.mesh.scale.x, e.mesh.scale.y, e.mesh.scale.z);
      const m = measure(e.mesh, R.camera); px.push(m.maxPx); rad.push(m.minR, m.maxR);
    }
    const span = (a) => (a.length ? Math.max(...a) - Math.min(...a) : Infinity);
    rows.push({ d, n: op.length, opMin: Math.min(...op), opMax: Math.max(...op), opSpan: span(op), scSpan: span(sc),
      pxMin: Math.min(...px), pxMax: Math.max(...px), pxSpan: span(px), rMin: Math.min(...rad), rMax: Math.max(...rad) });
  }
}
for (const r of rows) {
  console.log(`    d ${r.d} j.: klatek ${r.n}, krycie ${r.opMin.toFixed(3)}–${r.opMax.toFixed(3)}, skala ±${(r.scSpan / 2).toFixed(4)},` +
    ` szerokość ${r.pxMin.toFixed(2)}–${r.pxMax.toFixed(2)} px, promień środka pasa ${r.rMin.toFixed(4)}–${r.rMax.toFixed(4)} j.`);
}
const allD = rows.length === DISTS.length && rows.every((r) => r.n >= FRAMES);
assert(allD && rows.every((r) => r.opSpan <= 1e-12 && r.scSpan <= 1e-12),
  'T1 krycie i skala stałe z klatki na klatkę przy każdym dystansie (bez pulsu)');
assert(allD && rows.every((r) => r.opMax <= 0.35 && r.opMin >= 0.2), 'T2 krycie w [0,2; 0,35] (CP27: ~0,3)');
assert(allD && rows.every((r) => r.pxMax <= 2 && r.pxMin >= 1 && r.pxSpan <= 1e-6),
  'T3 szerokość linii na ekranie w [1; 2] px przy każdym dystansie, stała z klatki na klatkę');
assert(allD && rows.every((r) => Math.abs(r.rMin - RADIUS_MID) <= 0.01 && Math.abs(r.rMax - RADIUS_MID) <= 0.01),
  `T4 promień bez zmian: środek pasa ${RADIUS_MID} j. (± 0,01) w każdej klatce`);

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  ukryty przy „Obserwuj” (CP14): wykonanie + kontrola P2a bez zmian');
{
  let hidden = null, shown = null;
  if (methodsOk) {
    R._watch = { encounterId: enc.id }; R._tickEngagementMarkers(99_000);
    hidden = R._engagementMarkers.get(enc.id)?.mesh?.visible;
    R._watch = null; R._tickEngagementMarkers(99_016);
    shown = R._engagementMarkers.get(enc.id)?.mesh?.visible;
  }
  assert(hidden === false && shown === true, `T5a „Obserwuj” → pierścień niewidoczny (${hidden}), bez „Obserwuj” → widoczny (${shown})`);
  let out = '';
  try {
    out = execFileSync(process.execPath, [fileURLToPath(new URL('./combat_watch_frame_smoke.mjs', import.meta.url))],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout ?? ''); }
  assert(/✓ T11i /.test(out), 'T5b `combat_watch_frame_smoke` T11i (P2a) — PASS (keeper nieprzecelowany)');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  źródło: bez zegara realnego i sinusa w synchronizacji, szerokość z `engagementRingBand`, stałe z `ENGAGEMENT_RING`');
{
  const tick = strip(methodOf('_tickEngagementMarkers')?.text ?? '');
  const up = strip(methodOf('_upsertEngagementMarker')?.text ?? '');
  assert(tick.length > 0 && up.length > 0 && /planEngagementMarkers\(/.test(tick), 'T6-0 KONTROLA: obie metody znalezione (synchronizacja przez plan)');
  assert(!/getElapsedTime\(|Math\.sin\(|_clock/.test(tick) && !/getElapsedTime\(|Math\.sin\(|_clock/.test(up),
    'T6a synchronizacja i tworzenie znacznika bez zegara realnego i sinusa (puls usunięty)');
  assert(/engagementRingBand\(/.test(tick) && /visible = !this\._watch/.test(tick), 'T6b szerokość pasa co klatkę z `engagementRingBand`; ukrycie przy „Obserwuj” jak dotąd');
  assert(/ENGAGEMENT_RING\.OPACITY/.test(up) && /ENGAGEMENT_RING\.RADIUS/.test(up) && /ENGAGEMENT_RING\.SEGMENTS/.test(up),
    'T6c krycie, promień i podział z `ENGAGEMENT_RING`');
  const imp = TR.slice(0, TR.indexOf('export class ThreeRenderer'));
  assert(/ENGAGEMENT_RING/.test(imp) && /engagementRingBand/.test(imp) && /VesselFxLogic/.test(imp), 'T6d stałe i funkcja importowane z `VesselFxLogic`');
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════
header('T7  `engagementRingBand` — szerokość świata = WIDTH_PX · świat-na-piksel w głębi każdego wierzchołka');
{
  const RING = FX.ENGAGEMENT_RING;
  const band = typeof FX.engagementRingBand === 'function' ? FX.engagementRingBand : null;
  assert(!!RING && Object.isFrozen(RING) && RING.WIDTH_PX > 1 && RING.WIDTH_PX <= 2 && RING.OPACITY <= 0.35
    && Math.abs(RING.RADIUS - RADIUS_MID) < 1e-9, `T7a \`ENGAGEMENT_RING\` zamrożone: WIDTH_PX ${RING?.WIDTH_PX}, OPACITY ${RING?.OPACITY}, RADIUS ${RING?.RADIUS}`);
  let ok = false, detail = 'brak funkcji';
  if (band && RING) {
    const seg = 8, fov = 55, depthAt = (lx, ly) => 1 + 0.5 * lx;   // głębia rośnie z x
    const n = (seg + 1) * 2 * 3;
    // domyślnie Float32Array (jak atrybut geometrii); wzór sprawdzany na Float64Array — szerokość to różnica
    // dwóch promieni ~0,3, więc float32 daje błąd względny ~1e-5 (zmierzone 9,6e-6) bez błędu wzoru.
    const def = band({ radius: 0.3, widthPx: 1.5, segments: seg, fovDeg: fov, H, depthAt });
    const out = new Float64Array(n);
    const arr = band({ radius: 0.3, widthPx: 1.5, segments: seg, fovDeg: fov, H, depthAt, out });
    const k = 2 * Math.tan(fov * Math.PI / 360) / H;
    ok = def instanceof Float32Array && def.length === n && arr === out;
    let worst = 0;
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * 2 * Math.PI, cx = Math.cos(th), sy = Math.sin(th);
      const want = 1.5 * k * depthAt(0.3 * cx, 0.3 * sy);
      const ri = Math.hypot(arr[i * 3], arr[i * 3 + 1]), ro = Math.hypot(arr[(seg + 1 + i) * 3], arr[(seg + 1 + i) * 3 + 1]);
      worst = Math.max(worst, Math.abs((ro - ri) - want) / want, Math.abs((ro + ri) / 2 - 0.3) / 0.3);
      ok = ok && arr[i * 3 + 2] === 0;
    }
    ok = ok && worst < 1e-9; detail = `największy błąd względny ${worst.toExponential(1)} (Float64), domyślna tablica ${def?.constructor?.name}`;
  }
  assert(ok, `T7b pas: (seg + 1) × 2 wierzchołków w płaszczyźnie XY, zapis w miejscu (\`out\`), szerokość i środek zgodne ze wzorem (${detail})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
