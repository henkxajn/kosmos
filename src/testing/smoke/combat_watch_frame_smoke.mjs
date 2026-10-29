// ═══════════════════════════════════════════════════════════════════════════════
// combat_watch_frame_smoke — KEEPER Findingu 458 (POLISH P2a, krok P2-2; decyzje CP13, CP14)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (458) i §11 (P2a).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: „Obserwuj / Watch” kadrował STAŁY punkt startu starcia z bliska (≤ 1,2 j.) — walka odpływała od niego
//   o 0,08–0,115 AU, statki lądowały przy krawędzi (modele 8–9 px), a nakładki w rozmiarze świata rosły przy zbliżeniu:
//   szewrony 121–199 px, celownik 119–138 px, pierścień znacznika 121–165 px (P2 §10.3).
// CP13: kamera śledzi środek walki; dystans z dopasowania do rozpiętości uczestników z marginesem, w granicach.
// CP14: szewrony i celownik z limitem rozmiaru ekranowego; pierścień starcia ukryty przy „Obserwuj”.
// PRZECELOWANE 2026-10-29 (ZNACZNIK STATKU SM-Z): szewrony insygniów frakcji usunięte (znacznik statku w warstwie HUD 2D
//   ma rozmiar stały w px — keeper `hud_ship_marker_smoke`) — T8c bez limitu szewronu, T11g pinuje usunięcie, T11g2 —
//   odświeżenie macierzy kamery w pętli renderu (dawniej na początku `_syncInsignia`).
// ⚠ `ThreeRenderer` i kontroler kamery nie importują się pod node (THREE) ⇒ matematyka kadru żyje w czystym
//   `CombatWatchLogic` (wykonanie), sprawdzana NIEZALEŻNYM rzutem keepera (pełne macierze 4×4: `lookAt` kamery +
//   perspektywa jak `PerspectiveCamera`); renderer pinuje źródło (komentarze zdjęte). Panel walki — wykonaniem.
//
// PINY:
//   T1  baza kamery = macierz `lookAt` (oko = cel + d·(sin φ cos θ, cos φ, sin φ sin θ), góra (0, 1, 0)) — 4 pary kątów
//   T2  rzut modułu = rzut niezależny (macierz widoku · perspektywa, dzielenie przez w) — co do 1e-6 px
//   T3  kadr pary 1 na 1 (rozpiętość 0,045 AU, ekran audytu 1584 × 805, panel walki): wszyscy w prostokącie bezpiecznym
//       (rzut niezależny), dystans NAJMNIEJSZY (o 2 % bliżej — przy celu modułu dla tego dystansu — ktoś wypada), środek
//       PROSTOKĄTA RZUTU w środku prostokąta bezpiecznego; T3d — para wzdłuż osi widzenia (różna głębia: perspektywa)
//   T4  kadr 3 na 2 (rozpiętość ~0,2 AU): wszyscy w prostokącie, dystans w granicach
//   T5  granice: rozrzut znikomy → MIN_DIST; rozrzut 3 AU → MAX_DIST i `fits: false`
//   T6  wysoki panel walki NAD środkiem ekranu: kadr i tak nad panelem (kotwica w środku prostokąta, nie ekranu)
//   T7  prostokąt bezpieczny: paski UI, panele boczne (lewy outliner — ARKUSZ UI U2-2, prawy Outliner) i panel walki
//       odjęte; zbyt mały → cały ekran z marginesem
//   T8  limit billboardu: na ekranie ≤ limit; poniżej limitu rozmiar bez zmian (dzisiejszy wygląd z daleka)
//   T9  model przy kadrze 1 na 1 — nie mniejszy niż dziś przy „Obserwuj” (d 1,21: ~10 px); liczby z prawdziwej sceny — sonda
//   T10 `CombatHUD.getPanelRect` (wykonanie): prostokąt narysowanego panelu; brak przy braku starć i po minimalizacji
//   T11 źródło `ThreeRenderer`: śledzenie co klatkę PRZED `update()` kontrolera; kadr z pozycji SPRITE'ÓW; prostokąt
//       z panelem walki; koniec obserwacji przy przejęciu kamery / końcu starcia (minDist wraca); auto-fokus nie
//       przejmuje obserwowanej walki; limit szewronu i celownika; pierścień ukryty przy „Obserwuj”; bez tabeli strojenia
//   T12 efekty walki przy „Obserwuj” (błysk, pierścień osłony, wybuch): na ekranie nie większe niż w kadrze auto-fokusu
//       (głębia 6 j.) — rzut niezależny; poza „Obserwuj” i od głębi 6 j. bez zmian; pin źródłowy pętli efektów
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus      from '../../core/EventBus.js';
import { CombatHUD } from '../../ui/CombatHUD.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
// Moduł POWSTAJE w tym kroku — import dynamiczny w try/catch: na kodzie sprzed kroku pin DEGRADUJE (undefined),
// nie przerywa całej suity (statyczny import nieistniejącego modułu wywraca przebieg fail-first).
let W = {};
try { W = await import('../../renderer/CombatWatchLogic.js'); } catch { W = {}; }
const call = (name, ...a) => (typeof W[name] === 'function' ? W[name](...a) : undefined);
const C = W.COMBAT_WATCH ?? {};

// ── rzut NIEZALEŻNY (macierze 4×4, układ kolumnowy jak w Three.js) ─────────────────────────────────────────────
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function lookAtWorld(eye, target, up = [0, 1, 0]) {          // macierz świata kamery (kolumny x, y, z, oko)
  const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm(cross(up, z)); const y = cross(z, x);
  return { x, y, z, eye };
}
function viewMatrix(cw) {                                     // odwrotność macierzy sztywnej: R^T i −R^T·oko
  const { x, y, z, eye } = cw;
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [[x[0], x[1], x[2], -d(x, eye)], [y[0], y[1], y[2], -d(y, eye)], [z[0], z[1], z[2], -d(z, eye)], [0, 0, 0, 1]];
}
function perspective(fovDeg, aspect, near = 0.001, far = 1e5) {
  const f = 1 / Math.tan((fovDeg * Math.PI / 180) / 2);
  return [[f / aspect, 0, 0, 0], [0, f, 0, 0], [0, 0, (far + near) / (near - far), 2 * far * near / (near - far)], [0, 0, -1, 0]];
}
const mv = (m, p) => m.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3] * p[3]);
function refProject(p, { target, dist, theta, phi, fovDeg, aspect, Wpx, Hpx }) {
  const eye = [target.x + dist * Math.sin(phi) * Math.cos(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.sin(theta)];
  const V = viewMatrix(lookAtWorld(eye, [target.x, target.y, target.z]));
  const vp = mv(V, [p.x, p.y, p.z, 1]);
  const clip = mv(perspective(fovDeg, aspect), vp);
  return { x: (clip[0] / clip[3] + 1) / 2 * Wpx, y: (1 - clip[1] / clip[3]) / 2 * Hpx, depth: -vp[2] };
}
const inside = (s, r) => s.depth > 0 && s.x >= r.x0 - 1e-6 && s.x <= r.x1 + 1e-6 && s.y >= r.y0 - 1e-6 && s.y <= r.y1 + 1e-6;

// ekran i kamera z audytu P2 (§10.1, §10.3): viewport 1584 × 805, UI_SCALE 1,25, FOV 55°, θ 0,3, φ 1,1
const VW = 1584, VH = 805, FOV = 55, TH = 0.3, PH = 1.1, ASP = VW / VH;
const UI = 1.25;
const HUD = { x: 360, y: 415, w: 560, h: 183 };     // panel walki 1 na 1 (jednostki logiczne): px y 519 (jak audyt)
const AU = 11;                                       // [j.] na 1 AU (AU_TO_PX 110 / 10)

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  baza kamery = macierz `lookAt`');
{
  const pairs = [[0.3, 1.1], [1.7, 0.6], [-2.4, 2.2], [3.0, 1.5707963]];
  let maxErr = 0;
  for (const [th, ph] of pairs) {
    const b = call('cameraBasis', th, ph);
    const eye = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    const ref = lookAtWorld(eye, [0, 0, 0]);
    for (const k of ['x', 'y', 'z']) {
      const m = b?.[k + 'c']; const r = ref[k];
      maxErr = Math.max(maxErr, m ? Math.hypot(m.x - r[0], m.y - r[1], m.z - r[2]) : Infinity);
    }
  }
  console.log(`     największa różnica wersorów: ${maxErr.toExponential(2)}`);
  assert(maxErr < 1e-12, 'T1 xc, yc, zc = kolumny macierzy `lookAt` (4 pary kątów)');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  rzut modułu = rzut niezależny');
{
  const tgt = { x: 13.3, y: 0.2, z: -6.1 }, d = 0.73;
  const b = call('cameraBasis', TH, PH);
  const cam = b ? { x: tgt.x + d * b.zc.x, y: tgt.y + d * b.zc.y, z: tgt.z + d * b.zc.z } : null;
  const pts = [{ x: 13.0, y: 0.3, z: -6.0 }, { x: 13.6, y: 0.1, z: -6.4 }, { x: 13.3, y: 0.5, z: -5.8 }];
  let maxErr = 0;
  for (const p of pts) {
    const m = cam ? call('projectPoint', p, cam, b, { tanHalf: Math.tan(FOV * Math.PI / 360), aspect: ASP, W: VW, H: VH }) : null;
    const r = refProject(p, { target: tgt, dist: d, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, Wpx: VW, Hpx: VH });
    maxErr = Math.max(maxErr, m ? Math.max(Math.abs(m.x - r.x), Math.abs(m.y - r.y), Math.abs(m.depth - r.depth)) : Infinity);
  }
  console.log(`     największa różnica: ${maxErr.toExponential(2)} px`);
  assert(maxErr < 1e-6, 'T2 rzut modułu = macierz widoku · perspektywa (3 punkty, ≤ 1e-6 px)');
}

// ARKUSZ UI U2-2 (przecelowanie T7a): prostokąt jak w rendererze — z lewym outlinerem nad mapą (`leftW` 150).
const safe1 = call('watchSafeRect', { W: VW, H: VH, uiScale: UI, hudRect: HUD, topBarH: 46, bottomH: 42, rightW: 150, leftW: 150 });
const fitOf = (points, safe = safe1) => call('fitWatchFrame', { points, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, W: VW, H: VH, safe });
const proj = (p, fit) => refProject(p, { target: fit.target, dist: fit.dist, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, Wpx: VW, Hpx: VH });
/** środek prostokąta rzutu punktów (rzut niezależny) i jego odległość od środka prostokąta bezpiecznego [px] */
const bboxOff = (points, fit, safe = safe1) => {
  const ss = points.map((p) => proj(p, fit));
  const cx = (Math.min(...ss.map((x) => x.x)) + Math.max(...ss.map((x) => x.x))) / 2;
  const cy = (Math.min(...ss.map((x) => x.y)) + Math.max(...ss.map((x) => x.y))) / 2;
  return { dx: cx - (safe.x0 + safe.x1) / 2, dy: cy - (safe.y0 + safe.y1) / 2 };
};
const checkFit = (fit, points, safe = safe1) => points.map((p) => refProject(p, { target: fit.target, dist: fit.dist, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, Wpx: VW, Hpx: VH }))
  .every((s) => inside(s, safe));

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  kadr 1 na 1 (para 0,045 AU, panel walki)');
{
  // fregata gracza w wolnej przestrzeni (y 0,3) i strażnik na orbicie ciała (sprite na wysokości orbity, y 0,05)
  const pts = [{ x: 13.416 * 1, y: 0.3, z: -6.923 }, { x: 13.416 + 0.045 * AU * 0.8, y: 0.05, z: -6.923 + 0.045 * AU * 0.6 }];
  const fit = fitOf(pts);
  console.log(`     prostokąt ${JSON.stringify(safe1)}; kadr ${fit ? `d ${fit.dist.toFixed(4)} j., mieści ${fit.fits}` : '—'}`);
  assert(!!fit && fit.fits === true && checkFit(fit, pts), 'T3 SEDNO: obaj uczestnicy w prostokącie bezpiecznym (rzut niezależny)');
  // minimalność: o 2 % bliżej, z celem modułu dla TEGO dystansu (`watchTargetAt` — wyśrodkowany) — ktoś wypada
  let minimal = false;
  if (fit && fit.dist > (C.MIN_DIST ?? 0.4) + 1e-9) {
    const d = fit.dist * 0.98;
    const r = call('watchTargetAt', { points: pts, d, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, W: VW, H: VH, safe: safe1 });
    minimal = !!r?.target && !pts.map((p) => refProject(p, { target: r.target, dist: d, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, Wpx: VW, Hpx: VH })).every((x) => inside(x, safe1));
  }
  assert(minimal, 'T3b dystans NAJMNIEJSZY: o 2 % bliżej (cel modułu dla tego dystansu) ktoś wypada z prostokąta');
  const off = fit ? bboxOff(pts, fit) : null;
  console.log(`     środek prostokąta rzutu od środka prostokąta bezpiecznego: ${off ? `${off.dx.toFixed(2)}, ${off.dy.toFixed(2)} px` : '—'}`);
  assert(!!off && Math.abs(off.dx) <= 1 && Math.abs(off.dy) <= 1, 'T3c środek PROSTOKĄTA RZUTU uczestników w środku prostokąta bezpiecznego (≤ 1 px)');
}

// ═══ T3d ══════════════════════════════════════════════════════════════════════
header('T3d para wzdłuż osi widzenia (różna głębia) — kadr wyśrodkowany na ekranie, nie w 3D');
{
  // jak w sondzie P2a (W): fregata ~0,9 j. bliżej kamery niż strażnik — perspektywa przesuwa bliższego ku krawędzi
  const b = call('cameraBasis', TH, PH) ?? { zc: { x: 0, y: 0, z: 0 }, xc: { x: 1, y: 0, z: 0 }, yc: { x: 0, y: 1, z: 0 } };
  const g = { x: 15.0, y: 0.05, z: -6.6 };
  const f = { x: g.x + b.zc.x * 0.9 - b.xc.x * 0.6, y: 0.3, z: g.z + b.zc.z * 0.9 - b.xc.z * 0.6 };
  const pts = [f, g];
  const fit = fitOf(pts);
  const off = fit ? bboxOff(pts, fit) : null;
  const cen = fit ? proj(fit.centroid, fit) : null;
  const cenOff = cen ? Math.hypot(cen.x - (safe1.x0 + safe1.x1) / 2, cen.y - (safe1.y0 + safe1.y1) / 2) : null;
  const depths = fit ? pts.map((p) => proj(p, fit).depth) : [];
  console.log(`     kadr d ${fit ? fit.dist.toFixed(4) : '—'}; głębie ${depths.map((x) => x.toFixed(3)).join(' / ')}; środek prostokąta rzutu ${off ? `${off.dx.toFixed(2)}, ${off.dy.toFixed(2)}` : '—'} px; środek ciężkości 3D na ekranie ${cenOff != null ? cenOff.toFixed(1) : '—'} px od kotwicy`);
  assert(depths.length === 2 && Math.max(...depths) / Math.min(...depths) > 1.4, 'T3d-a scena: przy kadrze uczestnicy w wyraźnie różnej głębi (perspektywa działa)');
  assert(!!fit && fit.fits && checkFit(fit, pts) && !!off && Math.abs(off.dx) <= 1 && Math.abs(off.dy) <= 1,
    'T3d SEDNO: obaj w prostokącie, środek prostokąta rzutu w kotwicy (≤ 1 px)');
  assert(cenOff != null && cenOff > 20, 'T3d-b środek ciężkości 3D NIE leży w kotwicy (> 20 px) — centrowanie w 3D dałoby inny kadr');
}

// ═══ T4═══════════════════════════════════════════════════════════════════════
header('T4  kadr 3 na 2 (rozpiętość ~0,2 AU)');
{
  const o = { x: 20, y: 0.3, z: 4 };
  const pts = [[0, 0], [0.03, 0.02], [-0.02, 0.04], [0.16, 0.10], [0.19, 0.07]].map(([dx, dz], i) => ({ x: o.x + dx * AU, y: i < 3 ? 0.3 : 0.12, z: o.z + dz * AU }));
  const fit = fitOf(pts);
  console.log(`     kadr ${fit ? `d ${fit.dist.toFixed(4)} j., mieści ${fit.fits}` : '—'}`);
  assert(!!fit && fit.fits && checkFit(fit, pts) && fit.dist >= (C.MIN_DIST ?? 0.4) && fit.dist <= (C.MAX_DIST ?? 12),
    'T4 pięciu uczestników w prostokącie, dystans w granicach');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  granice dystansu');
{
  const tiny = fitOf([{ x: 1, y: 0.3, z: 1 }, { x: 1.001, y: 0.3, z: 1.0005 }]);
  const huge = fitOf([{ x: 0, y: 0.3, z: 0 }, { x: 3 * AU, y: 0.3, z: 0 }]);
  console.log(`     znikomy rozrzut: d ${tiny?.dist}; rozrzut 3 AU: d ${huge?.dist}, mieści ${huge?.fits}`);
  assert(tiny?.dist === C.MIN_DIST && tiny?.fits === true && C.MIN_DIST === 0.4, 'T5a znikomy rozrzut → MIN_DIST 0,4 j.');
  assert(huge?.dist === C.MAX_DIST && huge?.fits === false && C.MAX_DIST === 12, 'T5b rozrzut 3 AU → MAX_DIST 12 j., `fits: false` (kadr najlepszy możliwy)');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  wysoki panel walki nad środkiem ekranu');
{
  const tallHud = { x: 360, y: 300, w: 560, h: 320 };       // górna krawędź 375 px < środek ekranu 402,5 px
  const safe = call('watchSafeRect', { W: VW, H: VH, uiScale: UI, hudRect: tallHud, topBarH: 46, bottomH: 42, rightW: 150 });
  const pts = [{ x: 5, y: 0.3, z: 5 }, { x: 5.4, y: 0.3, z: 5.2 }, { x: 5.1, y: 0.1, z: 4.7 }];
  const fit = fitOf(pts, safe);
  console.log(`     prostokąt ${JSON.stringify(safe)}; kadr ${fit ? `d ${fit.dist.toFixed(4)}` : '—'}`);
  assert(!!safe && safe.y1 <= tallHud.y * UI - (C.MARGIN_PX ?? 40) + 1e-9 && safe.y1 < VH / 2, 'T6a dół prostokąta nad panelem — i nad środkiem ekranu (scena testu)');
  assert(!!fit && fit.fits && checkFit(fit, pts, safe), 'T6b SEDNO: wszyscy NAD panelem walki (kotwica w środku prostokąta, nie ekranu)');
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════
header('T7  prostokąt bezpieczny');
{
  const r = safe1;
  const m = C.MARGIN_PX ?? 40;
  assert(!!r && r.x0 === 150 * UI + m && r.x1 === VW - 150 * UI - m && r.y0 === 46 * UI + m && r.y1 === HUD.y * UI - m && r.fallback === false,
    'T7a paski UI (góra 46, dół 42), lewy outliner (150), prawy Outliner (150) i panel walki odjęte, margines 40 px');
  const noLeft = call('watchSafeRect', { W: VW, H: VH, uiScale: UI, hudRect: HUD, topBarH: 46, bottomH: 42, rightW: 150 });
  assert(!!noLeft && noLeft.x0 === m && noLeft.x1 === r?.x1, 'T7a2 KONTROLA: lewy outliner ukryty (`leftW` 0) — lewa krawędź = margines, jak przed U2');
  const noHud = call('watchSafeRect', { W: VW, H: VH, uiScale: UI, hudRect: null, topBarH: 46, bottomH: 42, rightW: 150 });
  assert(!!noHud && noHud.y1 === VH - 42 * UI - m, 'T7b bez panelu walki — dół nad dolnymi paskami');
  const tiny = call('watchSafeRect', { W: VW, H: VH, uiScale: UI, hudRect: { x: 0, y: 60, w: 1000, h: 500 }, topBarH: 46, bottomH: 42, rightW: 150 });
  assert(!!tiny && tiny.fallback === true && tiny.x0 === m && tiny.y1 === VH - m, 'T7c prostokąt zbyt mały — cały ekran z marginesem');
}

// ═══ T8 ═══════════════════════════════════════════════════════════════════════
header('T8  limit rozmiaru billboardu');
{
  const px = (world, depth) => world * VH / (2 * depth * Math.tan(FOV * Math.PI / 360));
  const capped = call('capBillboardWorld', 0.32, { capPx: 36, depth: 0.45, fovDeg: FOV, H: VH });
  const far = call('capBillboardWorld', 0.32, { capPx: 36, depth: 50, fovDeg: FOV, H: VH });
  console.log(`     szewron przy głębi 0,45: dziś ${px(0.32, 0.45).toFixed(1)} px → ${capped != null ? px(capped, 0.45).toFixed(1) : '—'} px; przy 50: ${far != null ? px(far, 50).toFixed(2) : '—'} px`);
  assert(capped != null && Math.abs(px(capped, 0.45) - 36) < 1e-9, 'T8a z bliska: dokładnie limit (36 px), dziś ~550 px');
  assert(far === 0.32, 'T8b z daleka (poniżej limitu): rozmiar świata bez zmian — dzisiejszy wygląd');
  assert(C.INSIGNIA_MAX_PX === undefined && C.RETICLE_MAX_PX === 44, 'T8c limity: celownik 44 px (CP14); szewron insygniów usunięty (SM-Z)');
}

// ═══ T9 ═══════════════════════════════════════════════════════════════════════
header('T9  model przy kadrze 1 na 1 — nie mniejszy niż dziś');
{
  const pts = [{ x: 13.416, y: 0.3, z: -6.923 }, { x: 13.416 + 0.045 * AU * 0.8, y: 0.05, z: -6.923 + 0.045 * AU * 0.6 }];
  const fit = fitOf(pts);
  const modelPx = (depth) => 0.016 * VH / (2 * depth * Math.tan(FOV * Math.PI / 360));
  const depths = fit ? pts.map((p) => refProject(p, { target: fit.target, dist: fit.dist, theta: TH, phi: PH, fovDeg: FOV, aspect: ASP, Wpx: VW, Hpx: VH }).depth) : [];
  const now = Math.min(...depths.map(modelPx));
  console.log(`     model (0,016 j.) przy kadrze: ${depths.length ? now.toFixed(1) : '—'} px (najmniejszy z dwóch); dziś przy d 1,21: ${modelPx(1.21).toFixed(1)} px`);
  assert(depths.length === 2 && now >= modelPx(1.21), 'T9 model nie mniejszy niż dziś przy „Obserwuj” (d 1,21; ta sama para, kadr obu w prostokącie)');
}

// ═══ T10 ══════════════════════════════════════════════════════════════════════
header('T10 `CombatHUD.getPanelRect` (wykonanie)');
{
  EventBus.clear();
  const enc = { id: 'e1', isActive: true, currentRound: 2, timeline: [], location: { systemId: 'sys_home', point: { x: 1, y: 2 } },
    sideA: { vesselIds: ['a'], joinedVesselIds: [], ownerEmpireId: 'player', label: 'A' },
    sideB: { vesselIds: ['b'], joinedVesselIds: [], ownerEmpireId: 'emp_t', label: 'B' },
    vesselStates: new Map([['a', { hp: 1, hpStart: 2, weapons: [] }], ['b', { hp: 1, hpStart: 2, weapons: [] }]]) };
  let list = [enc];
  window.KOSMOS = { civMode: true, deepSpaceCombatSystem: { listActive: () => list }, vesselManager: { _vessels: new Map() } };
  const hud = new CombatHUD();
  const ctx = new Proxy({ measureText: () => ({ width: 10 }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const has = typeof hud.getPanelRect === 'function';
  hud.draw(ctx, 1280, 720);
  const r = has ? hud.getPanelRect() : undefined;
  console.log(`     prostokąt ${JSON.stringify(r ?? null)}`);
  assert(!!r && r.w === 560 && r.x === 1280 / 2 - 280 && r.y > 0 && r.y + r.h < 720, 'T10a prostokąt narysowanego panelu (560 j. szerokości, środek ekranu, nad dołem)');
  hud.toggleMinimize(); hud.draw(ctx, 1280, 720);
  const rMin = has ? hud.getPanelRect() : undefined;
  hud.toggleMinimize(); list = []; hud.draw(ctx, 1280, 720);
  const rNone = has ? hud.getPanelRect() : undefined;
  assert(has && rMin === null && rNone === null, 'T10b zminimalizowany / brak starć — `null`');
}

// ═══ T11 ══════════════════════════════════════════════════════════════════════
header('T11 źródło `ThreeRenderer`');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const handler = (ev) => { const i = tr.indexOf(`EventBus.on('${ev}'`); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n    }));', i)); };
  const loop = body('  _startLoop() {');
  const up = loop.indexOf('this._updateWatchCamera()'); const cu = loop.indexOf('this._cameraController.update()');
  assert(loop.length > 0 && cu > 0, 'T11-0 KONTROLA: pętla renderu i `update()` kontrolera znalezione');
  assert(up > 0 && up < cu, 'T11a śledzenie co klatkę w pętli renderu, PRZED `update()` kontrolera');
  const fitB = body('  _computeWatchFit(enc) {');
  assert(/\.sprite\.position/.test(fitB) && !/\.position\.x\s*\/\s*10|S\(v\.position/.test(fitB) && /fitWatchFrame\(/.test(fitB)
    && /watchSafeRect\(/.test(fitB) && /getPanelRect/.test(fitB) && /hp > 0/.test(fitB) && /sprite\?\.visible/.test(fitB),
    'T11b kadr z pozycji SPRITE\'ÓW żywych, widocznych uczestników; prostokąt bez paneli UI i panelu walki');
  const upd = body('  _updateWatchCamera() {');
  assert(/_goalTarget/.test(upd) && /this\._endWatch\(\)/.test(upd) && /isEngagementInView\(/.test(upd)
    && /fitDist = false/.test(upd), 'T11c koniec przy przejęciu kamery i końcu / wyjściu starcia z widoku; kółko — koniec dopasowania dystansu');
  assert(/focusOnSmooth\(fit\.target\.x, fit\.target\.z, fit\.target\.y\)/.test(upd) && !/flyTo\(/.test(upd)
    && /if \(w\.fitDist\) cc\.setTargetDist\(fit\.dist\)/.test(upd),
    'T11c2 cel — szybkie śledzenie (`focusOnSmooth`, jak kamera na wybranym statku), nie sam lerp 0,08 (`flyTo`)');
  const sw = body('  _startWatch(encounterId, x, y) {');
  const swActive = sw.indexOf('if (!enc?.isActive) {'); const swWatch = sw.indexOf('this._watch = {'); const swFit = sw.indexOf('this._computeWatchFit(enc)');
  assert(swActive > 0 && swWatch > swActive && swFit > swWatch && /\} else \{[\s\S]*focusOnInstant\(S\(x\), S\(y\), 0\.3\)/.test(sw.slice(swFit)),
    'T11c3 aktywne starcie bez sprite\'ów (po przełączeniu układu — model GLB wstawia się asynchronicznie): obserwacja startuje, kadr dopasuje pierwsza klatka ze sprite\'ami');
  const end = body('  _endWatch() {');
  assert(/setMinDist\(w\.minDistBefore\)/.test(end), 'T11d koniec obserwacji: minDist wraca do wartości sprzed');
  const wb = handler('camera:watchBattle');
  assert(/_startWatch\(encounterId/.test(wb) && !/setTargetDist\(Math\.min\([^)]*1\.2\)\)/.test(wb), 'T11e „Obserwuj” uruchamia śledzenie (bez dawnego stałego kadru ≤ 1,2 j. w handlerze)');
  const eng = handler('vessel:engaged');
  assert(/if \(this\._watch\) return;/.test(eng) && eng.indexOf('if (this._watch) return;') < eng.indexOf('focusOn'),
    'T11f auto-fokus nowego starcia nie przejmuje obserwowanej walki');
  assert(!/_upsertInsignia|_syncInsignia|INSIGNIA_WORLD_SIZE|INSIGNIA_LIFT_RATIO|INSIGNIA_MAX_PX/.test(tr),
    'T11g szewron insygniów usunięty (SM-Z) — znacznik statku rysuje warstwa HUD w rozmiarze stałym w px');
  const mw = loop.indexOf('this.camera.updateMatrixWorld()');
  assert(mw > 0 && loop.indexOf('this._syncCombatHpBars()') > mw && loop.indexOf('this._syncEnemyAlertMarkers()') > mw,
    'T11g2 macierz widoku kamery odświeżona w pętli renderu PRZED paskami HP i celownikiem (bez opóźnienia o klatkę przy zbliżaniu)');
  const ret = body('  _syncEnemyAlertMarkers() {');
  assert(/capBillboardWorld\(ALERT_MARKER_SCALE \* distFactor/.test(ret) && /RETICLE_MAX_PX/.test(ret), 'T11h celownik: limit ekranowy');
  const mk = body('  _tickEngagementMarkers(nowMs) {');
  assert(/visible = !this\._watch/.test(mk), 'T11i pierścień starcia ukryty przy „Obserwuj”');
  let logic = null;
  try { logic = strip(readFileSync(new URL('../../renderer/CombatWatchLogic.js', import.meta.url), 'utf8')); } catch { logic = null; }
  assert(logic != null && !/StrikesBackTuning|import\s/.test(logic) && !/StrikesBackTuning/.test(tr),
    'T11j bez tabeli strojenia (zamknięty zbiór czytelników — `sb1_fleet_tuning_smoke` T11b); moduł kadru bez importów');
}

// ═══ T12 ══════════════════════════════════════════════════════════════════════
header('T12 efekty walki przy „Obserwuj” — limit rozmiaru na ekranie');
{
  const H = 805, fov = 60, th = Math.tan(fov * Math.PI / 360);
  const px = (worldDiam, depth) => worldDiam * H / (2 * depth * th);   // rzut niezależny: rozmiar na ekranie
  // pierścień osłony na końcu życia: promień zewnętrzny 0,10 j. × skala 3 (`_updateActiveEffects`, 'shieldRing')
  const ring = 0.6;
  const ref = px(ring, 6);
  const rows = [0.25, 0.45, 1.2, 3].map((d) => ({ d, k: call('watchFxScale', d), before: px(ring, d) }));
  for (const r of rows) console.log(`     głębia ${r.d} j.: dziś ${r.before.toFixed(1)} px → przy „Obserwuj” ${Number.isFinite(r.k) ? (px(ring * r.k, r.d)).toFixed(1) : '—'} px (limit ${ref.toFixed(1)} px)`);
  assert(C.FX_REF_DEPTH === 6, 'T12-0 głębia odniesienia = kadr auto-fokusu (≤ 6 j., `vessel:engaged`)');
  assert(rows.every((r) => Number.isFinite(r.k) && Math.abs(px(ring * r.k, r.d) - ref) < 1e-9) && rows[1].before > 5 * ref,
    'T12a bliżej niż 6 j.: efekt na ekranie DOKŁADNIE jak w kadrze auto-fokusu (dziś przy 0,45 j. — ponad 5× większy)');
  assert(call('watchFxScale', 6) === 1 && call('watchFxScale', 40) === 1, 'T12b od głębi 6 j. — bez zmian (dzisiejszy wygląd z daleka)');
  assert(call('watchFxScale', 0) === 1 && call('watchFxScale', -0.3) === 1 && call('watchFxScale', NaN) === 1,
    'T12c głębia nieokreślona albo za kamerą — bez zmian');
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const i = tr.indexOf('  _updateActiveEffects(nowMs) {'); const fx = i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i));
  const sw = fx.indexOf('switch (ef.kind)'); const cap = fx.indexOf('watchFxScale(this._viewDepth(ef.mesh.position))');
  assert(/const watchFx = !!this\._watch;/.test(fx) && /if \(watchFx\) this\.camera\.updateMatrixWorld\(\);/.test(fx)
    && sw > 0 && cap > sw && /if \(watchFx && FX_WATCH_CAPPED\.has\(ef\.kind\)\)/.test(fx),
    'T12d pętla efektów: limit tylko przy „Obserwuj”, PO ustawieniu skali rodzaju, macierz widoku bieżąca');
  const set = /const FX_WATCH_CAPPED = new Set\(\[([^\]]*)\]\)/.exec(tr)?.[1] ?? '';
  const kinds = set.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
  assert(kinds.join(',') === 'explosion,explosionRing,flash,shieldRing', `T12e rodzaje z limitem: błysk, pierścień osłony, wybuch (kula i pierścień) — jest [${kinds.join(', ')}]; smugi bez zmian`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
