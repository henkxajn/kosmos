// WorkshopLogic — czysta logika Model Workshopu (ARC COMBAT VISUALS, krok CV-1c; plan §2.11, D-CV-16;
// `docs/design/COMBAT_VISUALS_PLAN.md`). Zero Three.js, zero DOM — wykonuje się pod node (keeper `cv_workshop_logic_smoke`).
//
// Workshop klika na modelu statku: dziób, dyszę (+ kierunek smugi), wieżyczki W1…Wn i punkty świetlne, stroi maskę
// koloru-klucza i zapisuje `assets/models/ships/hardpoints/<slot>.json` (schemat v1 — `src/data/ShipHardpointsSchema.js`).
//
// PRZESTRZEŃ: wszystkie punkty w ZNORMALIZOWANEJ przestrzeni modelu (środek bbox w 0, najdłuższy wymiar 1,0) — tej samej, w której
// żyją dzieci grupy `canon` rigu gry (`ShipModelRig.buildShipRig`). Klik: punkt trafienia promienia w świecie → `worldToModel`
// z macierzą świata `canon` (dowolny obrót ramy i skala klasy — macierz to uwzględnia).
//
// LUSTRO: płaszczyzna środkowa statku = płaszczyzna (dziób, góra) przez środek (0, 0, 0); jej normalna `right = góra × dziób`
// (ta sama konwencja co `frameQuaternion`). Bliźniak: p' = p − 2 (p·right) right. Punkt NA płaszczyźnie (|p·right| < MIRROR_EPS)
// — bez bliźniaka. Dla sześciu modeli właściciela (dziób −X, góra +Y) to po prostu z → −z.
//
// ZAPIS bezpieczny dla SCALANIA normalizatora (`tools/ship-models/lib/hardpoints.mjs`): Workshop zmienia WYŁĄCZNIE pola modelu
// `frame`, `nozzles`, `weapons`, `lights`, `keyColour` (+ dopisek w `notes`); `schema`, `version`, `slot`, `source`
// (sha256, normalizer, input) i `damagePoints` przechodzą NIETKNIĘTE — po nich normalizator rozpoznaje ten sam model i ponowna
// normalizacja zachowuje kliknięcia (`CARRIED_FIELDS`). Dokument niepoprawny wg `validateHardpoints` nigdy nie powstaje.

import { validateHardpoints, KEY_COLOUR_DEFAULTS, KEY_COLOUR_LIMITS, KEY_COLOUR_MODES, LIGHT_DEFAULTS } from '../../src/data/ShipHardpointsSchema.js';
import { VESSEL_MODEL_KEYS } from '../../src/renderer/VesselModelResolver.js';

// 2 — od poprawki po kontroli właściciela (2026-11-11): stan sprzed niej mógł nieść ramę z „górą” przestawioną przez klik dziobu
// w punkt z przewagą osi Y (statek w grze na boku) — sesja v1 nie jest przywracana.
export const WORKSHOP_VERSION = 2;
export const MIRROR_EPS = 0.004;        // [przestrzeń znormalizowana] punkt bliżej płaszczyzny środkowej — bez bliźniaka (0,4 % długości)
export const TWIN_INFER_TOL = 0.02;     // tolerancja rozpoznania pary lustrzanej przy wczytaniu pliku (bliźniak „przyklejony" do kadłuba)
export const HISTORY_CAP = 200;
export const SESSION_HISTORY_KEEP = 50; // ile kroków cofania trafia do sessionStorage (rozmiar)
export const NOZZLE_R_RANGE = Object.freeze([0.01, 0.15]);
export const LIGHT_SIZE_RANGE = Object.freeze([0.005, 0.08]);
// Domyślny rozmiar punktu klikanego w Workshopie (średnica, × długość statku). Większy od zapasu schematu (0,012): w bitwie fregata
// ma na ekranie ok. 20–60 px, a punkt mniejszy niż `MODEL_LIGHT_MIN_PX` (1,5 px) gaśnie — 0,03 widać z bliska i w kinie.
export const LIGHT_SIZE_DEFAULT = 0.03;
// Kolory punktów świetlnych (sRGB '#rrggbb'): cyjan klucza (= LIGHT_DEFAULTS.colour), czerwony / zielony (światła pozycyjne), biały —
// te same co testowy wzór `lightTestPattern` (CV-1a).
export const LIGHT_COLOURS = Object.freeze({ cyan: LIGHT_DEFAULTS.colour, red: '#ff4040', green: '#40ff60', white: '#ffffff' });
export const CATEGORIES = Object.freeze(['nozzle', 'weapons', 'lights']);

// ── drobne narzędzia wektorowe ────────────────────────────────────────────────────────────────────────────────────────
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Zaokrąglenie SYMETRYCZNE (round(−x) = −round(x)) — bliźniak z → −z zostaje dokładnym lustrem po zaokrągleniu. */
export function roundSym(x, decimals = 4) {
  const k = 10 ** decimals;
  const r = Math.sign(x) * Math.round(Math.abs(x) * k) / k;
  return r + 0;   // bez −0
}
const r4v = (v) => v.map((c) => roundSym(c, 4));

// ── przestrzeń modelu ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Odwrotność macierzy 4×4 (kolumnowo, jak `Matrix4.elements`) albo null przy macierzy osobliwej. */
export function invert4(m) {
  const n11 = m[0], n21 = m[1], n31 = m[2], n41 = m[3], n12 = m[4], n22 = m[5], n32 = m[6], n42 = m[7];
  const n13 = m[8], n23 = m[9], n33 = m[10], n43 = m[11], n14 = m[12], n24 = m[13], n34 = m[14], n44 = m[15];
  const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
  const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
  const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
  const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-20) return null;
  const d = 1 / det;
  return [
    t11 * d,
    (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d,
    (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d,
    (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d,
    t12 * d,
    (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d,
    (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d,
    (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d,
    t13 * d,
    (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d,
    (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d,
    (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d,
    t14 * d,
    (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d,
    (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d,
    (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d,
  ];
}

/**
 * Punkt trafienia w świecie → punkt hardpointu w znormalizowanej przestrzeni modelu.
 * @param {number[]} pWorld — [x, y, z] świata
 * @param {number[]} canonWorldElements — `rig.canon.matrixWorld.elements` (16, kolumnowo)
 * @returns {number[]|null}
 */
export function worldToModel(pWorld, canonWorldElements) {
  const inv = invert4(canonWorldElements);
  if (!inv) return null;
  const [x, y, z] = pWorld;
  const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15] || 1;
  return [
    (inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w,
    (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w,
    (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w,
  ];
}

/** Kierunek w świecie → kierunek w przestrzeni modelu (jednostkowy; skala jednorodna — obrót odwrotny). */
export function dirWorldToModel(dWorld, canonWorldElements) {
  const inv = invert4(canonWorldElements);
  if (!inv) return null;
  const [x, y, z] = dWorld;
  return norm([inv[0] * x + inv[4] * y + inv[8] * z, inv[1] * x + inv[5] * y + inv[9] * z, inv[2] * x + inv[6] * y + inv[10] * z]);
}

// ── rama i lustro ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** „Góra" zrzutowana prostopadle do dziobu (jak `frameQuaternion`). */
export function orthoUp(frame) {
  const bow = norm(frame?.bow ?? [-1, 0, 0]);
  const up0 = frame?.up ?? [0, 1, 0];
  const d = dot(up0, bow);
  return norm([up0[0] - d * bow[0], up0[1] - d * bow[1], up0[2] - d * bow[2]]);
}

/** Normalna płaszczyzny środkowej: right = góra × dziób (konwencja `frameQuaternion`; dla dziobu −X i góry +Y: +Z). */
export function mirrorNormal(frame) {
  return norm(cross(orthoUp(frame), norm(frame?.bow ?? [-1, 0, 0])));
}

/** Odbicie punktu względem płaszczyzny środkowej (DOKŁADNE: p' = p − 2 (p·right) right). */
export function mirrorPoint(p, frame) {
  const r = mirrorNormal(frame);
  const k = 2 * dot(p, r);
  return [p[0] - k * r[0], p[1] - k * r[1], p[2] - k * r[2]];
}

/** Odbicie kierunku (normalnej powierzchni) — ten sam wzór co punkt (płaszczyzna przechodzi przez środek). */
export const mirrorDir = mirrorPoint;

/** Czy punkt leży NA płaszczyźnie środkowej (bliźniak byłby tym samym punktem). */
export function onMirrorPlane(p, frame, eps = MIRROR_EPS) {
  return Math.abs(dot(p, mirrorNormal(frame))) < eps;
}

/**
 * Dziób z kliknięcia: kierunek od środka do punktu ZAOKRĄGLONY do osi modelu (±X / ±Y / ±Z) — klik w czubek nigdy nie wypada
 * idealnie w osi, a krzywy dziób przechyliłby statek w grze. Modele po normalizatorze mają najdłuższą oś X (dziób ±X).
 * @returns {number[]|null} jednostkowa oś albo null (klik w środek)
 */
export function snapBowAxis(p) {
  const a = p.map(Math.abs);
  const i = a[0] >= a[1] && a[0] >= a[2] ? 0 : (a[1] >= a[2] ? 1 : 2);
  if (a[i] < 1e-6) return null;
  const out = [0, 0, 0];
  out[i] = p[i] > 0 ? 1 : -1;
  return out;
}

// Klik dziobu przyjmowany tylko przy KOŃCU statku: |p · oś najdłuższa| ≥ BOW_CLICK_MIN (kadłub ma −0,5…0,5). Kontrola
// właściciela 2026-11-11: klik w wieżę na środku (przewaga osi Y) ustawiał dziób na ±Y, a „góra” przeskakiwała na +Z i już
// nie wracała — statek w grze leciał na boku, lustro odbijało góra ↔ dół.
export const BOW_CLICK_MIN = 0.25;

/** Oś najdłuższego wymiaru prostopadłościanu (przestrzeń znormalizowana) — dziób leży na niej we wszystkich modelach gry. */
export function longestAxisOf(min, max) {
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const i = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : (ext[1] >= ext[2] ? 1 : 2);
  const out = [0, 0, 0];
  out[i] = 1;
  return out;
}

/**
 * Dziób z kliku: znak rzutu punktu na oś najdłuższą (bez osi — oś przeważającej składowej). Klik bliżej środka niż
 * BOW_CLICK_MIN — odmowa (wieża, mostek, środek kadłuba to nie dziób).
 * @returns {{ bow: number[]|null, reason: null|'mid' }}
 */
export function bowFromClick(p, { longAxis = null, minAbs = BOW_CLICK_MIN } = {}) {
  const axis = Array.isArray(longAxis) ? norm(longAxis) : snapBowAxis(p);
  if (!axis) return { bow: null, reason: 'mid' };
  const t = dot(p, axis);
  if (Math.abs(t) < minAbs) return { bow: null, reason: 'mid' };
  const sg = t > 0 ? 1 : -1;
  return { bow: axis.map((c) => c * sg + 0), reason: null };
}

/** Rama z nowym dziobem: „góra" — pierwsza prostopadła z: preferowanej (z PLIKU), bieżącej, +Y, +Z, +X. */
export function frameWithBow(frame, bow, upPref = null) {
  const b = norm(bow);
  for (const up of [upPref, frame?.up, [0, 1, 0], [0, 0, 1], [1, 0, 0]]) {
    if (!up) continue;
    const u = norm(up);
    if (Math.abs(dot(u, b)) < 0.05) return { bow: b.map((c) => c + 0), up: u.map((c) => roundSym(c, 6)) };
  }
  return { bow: b, up: [0, 1, 0] };
}

// ── dysza w OTWORZE ──────────────────────────────────────────────────────────────────────────────────────────────────
// Wylot silnika to zwykle pierścień albo dzwon — jego środek to PUSTKA, więc klik „w wylot” trafia ścianę tunelu (kontrola
// właściciela 2026-11-11: dysza warp_frigate na dolnej ścianie wnętrza pierścienia, 0,024 pod osią — smuga wychodziła z boku
// otworu). Workshop rzuca promienie w płaszczyźnie ⟂ kierunku smugi z punktu przy kliku; trafienia w ściany otworu wyznaczają
// okrąg (dopasowanie algebraiczne Kåsy — dokładne dla punktów na okręgu niezależnie od ich rozkładu), środek = dysza,
// promień = promień otworu. Za mało trafień (płaska rufa, zewnętrzna krawędź) — dysza zostaje w punkcie kliku.
export const OPENING = Object.freeze({ RAYS: 16, MIN_HITS: 12, FAR: 0.25, R_MIN: 0.006, R_MAX: 0.2, MAX_RMS_REL: 0.15, STEP: 0.004, MOUTH_STEP: 0.004, MOUTH_STEPS: 40, MOUTH_GAP: 4 });

/** Ortonormalna baza (u, v) płaszczyzny prostopadłej do d (u × v = d). */
export function planeBasis(d) {
  const n = norm(d);
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(a, n));
  return [u, cross(n, u)];
}

/** Okrąg dopasowany do punktów 2D (Kåsa: min Σ(x² + y² + Dx + Ey + F)²) → { cx, cy, r, rms } albo null. */
export function fitCircle2D(pts) {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  // [sxx sxy sx; sxy syy sy; sx sy n] · [D E F] = −[sxz syz sz]
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const b = [-sxz, -syz, -sz];
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const det = det3(A);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  const col = (k) => A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
  const D = det3(col(0)) / det, E = det3(col(1)) / det, F = det3(col(2)) / det;
  const cx = -D / 2, cy = -E / 2, r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  let ss = 0;
  for (const [x, y] of pts) { const e = Math.hypot(x - cx, y - cy) - r; ss += e * e; }
  return { cx, cy, r, rms: Math.sqrt(ss / n) };
}

/**
 * Środek otworu dyszy z trafień promieni rzuconych w płaszczyźnie ⟂ d z punktu `origin`.
 * @param {{ origin:number[], d:number[], hits:number[][], o?:object }} a — hits: punkty trafień (przestrzeń modelu)
 * @returns {{ centre:number[], r:number, rms:number, count:number }|null}
 */
export function openingFromHits({ origin, d, hits, o = OPENING }) {
  if (!Array.isArray(hits) || hits.length < o.MIN_HITS) return null;
  const [u, v] = planeBasis(d);
  const pts = hits.map((h) => { const w = [h[0] - origin[0], h[1] - origin[1], h[2] - origin[2]]; return [dot(w, u), dot(w, v)]; });
  const c = fitCircle2D(pts);
  if (!c || c.r < o.R_MIN || c.r > o.R_MAX || c.rms > o.MAX_RMS_REL * c.r) return null;
  const centre = [0, 1, 2].map((k) => origin[k] + c.cx * u[k] + c.cy * v[k]);
  return { centre, r: c.r, rms: c.rms, count: hits.length };
}

/** Kierunki promieni szukania otworu (w płaszczyźnie ⟂ d, równo rozłożone). */
export function openingRayDirs(d, n = OPENING.RAYS) {
  const [u, v] = planeBasis(d);
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n, c = Math.cos(a), s = Math.sin(a);
    return [c * u[0] + s * v[0], c * u[1] + s * v[1], c * u[2] + s * v[2]];
  });
}

/** Kierunek smugi dyszy: 'stern' — przeciwnie do dziobu (domyślnie); 'normal' — normalna powierzchni w punkcie kliku. */
export function nozzleDirection(mode, frame, faceNormal = null) {
  if (mode === 'normal' && Array.isArray(faceNormal) && len(faceNormal) > 1e-9) return norm(faceNormal);
  const b = norm(frame?.bow ?? [-1, 0, 0]);
  return [-b[0] + 0, -b[1] + 0, -b[2] + 0];
}

// ── stan edycji (niemutowalny) ────────────────────────────────────────────────────────────────────────────────────────
//
// edit = {
//   v: WORKSHOP_VERSION,
//   frame: { bow, up },
//   nozzle: { p, d, r } | null,
//   weapons: [{ uid, p, twin }],                         // id „W<n>" = kolejność (W1…Wn), nadawane przy zapisie
//   lights:  [{ uid, p, size, colour, gain?, twin }],
//   keyColour: { mode, hue, hueTol, satMin, valMin, soft, gain },
//   nextUid,
// }
// `twin` = uid bliźniaka lustrzanego (para symetryczna) albo null.

/** Stan edycji z dokumentu hardpointów (pary lustrzane rozpoznane geometrycznie). */
export function editFromDoc(doc) {
  const frame = { bow: [...(doc?.frame?.bow ?? [-1, 0, 0])], up: [...(doc?.frame?.up ?? [0, 1, 0])] };
  let uid = 1;
  const weapons = (Array.isArray(doc?.weapons) ? doc.weapons : []).map((w) => ({ uid: uid++, p: [...w.p], twin: null }));
  const lights = (Array.isArray(doc?.lights) ? doc.lights : []).map((l) => {
    const o = { uid: uid++, p: [...l.p], size: l.size, colour: l.colour ?? LIGHT_DEFAULTS.colour, twin: null };
    if (Number.isFinite(l.gain)) o.gain = l.gain;
    return o;
  });
  const n0 = Array.isArray(doc?.nozzles) && doc.nozzles.length ? doc.nozzles[0] : null;
  const edit = {
    v: WORKSHOP_VERSION,
    frame,
    nozzle: n0 ? { p: [...n0.p], d: [...n0.d], r: n0.r } : null,
    weapons: inferTwins(weapons, frame),
    lights: inferTwins(lights, frame, (a, b) => a.size === b.size),
    keyColour: { ...KEY_COLOUR_DEFAULTS, ...(doc?.keyColour ?? {}) },
    nextUid: uid,
  };
  return edit;
}

/** Pary lustrzane w liście (najbliższy nieprzypisany punkt w tolerancji odbicia; punkty na płaszczyźnie — bez pary). */
export function inferTwins(items, frame, compatible = () => true, tol = TWIN_INFER_TOL) {
  const out = items.map((it) => ({ ...it, twin: null }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].twin !== null || onMirrorPlane(out[i].p, frame)) continue;
    const m = mirrorPoint(out[i].p, frame);
    let best = -1, bestD = tol;
    for (let j = 0; j < out.length; j++) {
      if (j === i || out[j].twin !== null || onMirrorPlane(out[j].p, frame) || !compatible(out[i], out[j])) continue;
      const d = len([m[0] - out[j].p[0], m[1] - out[j].p[1], m[2] - out[j].p[2]]);
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best >= 0) { out[i].twin = out[best].uid; out[best].twin = out[i].uid; }
  }
  return out;
}

const listOf = (edit, cat) => (cat === 'weapons' ? edit.weapons : edit.lights);
const withList = (edit, cat, list) => (cat === 'weapons' ? { ...edit, weapons: list } : { ...edit, lights: list });

/** Ustaw dziób z punktu kliku (zaokrąglony do osi). Klik w środek — bez zmiany. */
export function setBow(edit, p, { longAxis = null, upPref = null } = {}) {
  const { bow } = bowFromClick(p, { longAxis });
  if (!bow) return edit;
  const frame = frameWithBow(edit.frame, bow, upPref);
  return frame.bow.join() === edit.frame.bow.join() && frame.up.join() === edit.frame.up.join() ? edit : { ...edit, frame };
}

/** Ustaw dyszę (jedna — gra czyta `nozzles[0]`). Promień: podany, inaczej dotychczasowy, inaczej 0,04. */
export function setNozzle(edit, p, d, r = null) {
  const rr = Number.isFinite(r) ? r : (edit.nozzle?.r ?? 0.04);
  return { ...edit, nozzle: { p: [...p], d: norm(d), r: clamp(rr, NOZZLE_R_RANGE[0], NOZZLE_R_RANGE[1]) } };
}

export function setNozzleRadius(edit, r) {
  if (!edit.nozzle || !Number.isFinite(r)) return edit;
  return { ...edit, nozzle: { ...edit.nozzle, r: clamp(r, NOZZLE_R_RANGE[0], NOZZLE_R_RANGE[1]) } };
}

/** Kolor bliźniaka przy lustrze: opcjonalna zamiana czerwony ↔ zielony (światła pozycyjne: lewa burta czerwona, prawa zielona). */
export function twinColour(colour, swapNav) {
  if (!swapNav) return colour;
  const c = String(colour).toLowerCase();
  if (c === LIGHT_COLOURS.red) return LIGHT_COLOURS.green;
  if (c === LIGHT_COLOURS.green) return LIGHT_COLOURS.red;
  return colour;
}

/**
 * Dodaj punkt kategorii ('weapons' / 'lights'). Przy lustrze — także bliźniak po drugiej burcie (wstawiony ZARAZ za punktem,
 * więc wieżyczki parami: W1 / W2, W3 / W4…). `twinP` — opcjonalne położenie bliźniaka (Workshop „przykleja" go do kadłuba);
 * brak ⇒ dokładne odbicie.
 * @param {{ mirror?: boolean, twinP?: number[]|null, size?: number, colour?: string, gain?: number, swapNav?: boolean }} [o]
 * @returns {{ edit: object, uid: number, twinUid: number|null }}
 */
export function addPoint(edit, cat, p, o = {}) {
  const list = [...listOf(edit, cat)];
  let next = edit.nextUid;
  const make = (pp, colour) => {
    const it = { uid: next++, p: [...pp], twin: null };
    if (cat === 'lights') {
      it.size = clamp(Number.isFinite(o.size) ? o.size : LIGHT_SIZE_DEFAULT, LIGHT_SIZE_RANGE[0], LIGHT_SIZE_RANGE[1]);
      it.colour = colour;
      if (Number.isFinite(o.gain)) it.gain = o.gain;
    }
    return it;
  };
  const colour = o.colour ?? LIGHT_COLOURS.cyan;
  const a = make(p, colour);
  list.push(a);
  let twinUid = null;
  if (o.mirror && !onMirrorPlane(p, edit.frame)) {
    const b = make(o.twinP ?? mirrorPoint(p, edit.frame), twinColour(colour, o.swapNav));
    a.twin = b.uid; b.twin = a.uid;
    list.push(b);
    twinUid = b.uid;
  }
  return { edit: { ...withList(edit, cat, list), nextUid: next }, uid: a.uid, twinUid };
}

/** Przesuń punkt; przy lustrze bliźniak idzie za nim (odbicie albo `twinP`). Bez lustra — tylko punkt (para zostaje). */
export function movePoint(edit, cat, uid, p, o = {}) {
  const list = listOf(edit, cat);
  const it = list.find((x) => x.uid === uid);
  if (!it) return edit;
  const twinTo = o.mirror && it.twin !== null ? (o.twinP ?? mirrorPoint(p, edit.frame)) : null;
  return withList(edit, cat, list.map((x) => {
    if (x.uid === uid) return { ...x, p: [...p] };
    if (twinTo && x.uid === it.twin) return { ...x, p: [...twinTo] };
    return x;
  }));
}

/** Usuń punkt; przy lustrze także bliźniaka. Bez lustra bliźniak zostaje (bez pary). */
export function deletePoint(edit, cat, uid, o = {}) {
  const list = listOf(edit, cat);
  const it = list.find((x) => x.uid === uid);
  if (!it) return edit;
  const drop = new Set([uid]);
  if (o.mirror && it.twin !== null) drop.add(it.twin);
  return withList(edit, cat, list.filter((x) => !drop.has(x.uid)).map((x) => (drop.has(x.twin) ? { ...x, twin: null } : x)));
}

/** Zmień kolor / rozmiar punktu świetlnego (przy lustrze — także bliźniaka; kolor bliźniaka wg zamiany nawigacyjnej). */
export function setLightProps(edit, uid, props, o = {}) {
  const it = edit.lights.find((x) => x.uid === uid);
  if (!it) return edit;
  let changed = false;
  const lights = edit.lights.map((x) => {
    const isSelf = x.uid === uid, isTwin = o.mirror && it.twin !== null && x.uid === it.twin;
    if (!isSelf && !isTwin) return x;
    const size = Number.isFinite(props.size) ? clamp(props.size, LIGHT_SIZE_RANGE[0], LIGHT_SIZE_RANGE[1]) : x.size;
    const colour = typeof props.colour === 'string' ? (isTwin ? twinColour(props.colour, o.swapNav) : props.colour) : x.colour;
    if (size === x.size && colour === x.colour) return x;
    changed = true;
    return { ...x, size, colour };
  });
  // Bez zmiany wartości — TEN SAM stan (historia nie dostaje pustego kroku cofania).
  return changed ? { ...edit, lights } : edit;
}

/** Wyczyść kategorię ('weapons' / 'lights' / 'nozzle'). */
export function clearCategory(edit, cat) {
  if (cat === 'nozzle') return { ...edit, nozzle: null };
  return withList(edit, cat, []);
}

/** Przywróć część stanu z dokumentu pliku: 'frame' / 'nozzle' / 'weapons' / 'lights' / 'keyColour' / 'all'. */
export function revertPart(edit, fileEdit, part) {
  if (part === 'all') return { ...clone(fileEdit), nextUid: Math.max(edit.nextUid, fileEdit.nextUid) };
  const f = clone(fileEdit);
  let next = edit.nextUid;
  const renum = (list) => {   // uid z pliku mogą kolidować z bieżącymi — nowe, z zachowaniem par
    const map = new Map(list.map((x) => [x.uid, next++]));
    return list.map((x) => ({ ...x, uid: map.get(x.uid), twin: x.twin === null ? null : (map.get(x.twin) ?? null) }));
  };
  if (part === 'frame') return { ...edit, frame: f.frame };
  if (part === 'nozzle') return { ...edit, nozzle: f.nozzle };
  if (part === 'keyColour') return { ...edit, keyColour: f.keyColour };
  if (part === 'weapons') { const w = renum(f.weapons); return { ...edit, weapons: w, nextUid: next }; }
  if (part === 'lights') { const l = renum(f.lights); return { ...edit, lights: l, nextUid: next }; }
  return edit;
}

export function setKeyColour(edit, kc) {
  return { ...edit, keyColour: { ...edit.keyColour, ...kc } };
}

/** Identyfikatory wieżyczek wg kolejności (W1…Wn). */
export function weaponIds(edit) { return edit.weapons.map((_, i) => 'W' + (i + 1)); }

// ── suwaki maski ↔ keyColour ──────────────────────────────────────────────────────────────────────────────────────────

/** Suwaki maski: zakresy z `KEY_COLOUR_LIMITS`, krok = kwantyzacja zapisu (barwa i tolerancja w stopniach, reszta 0,01 / 0,1). */
export const SLIDERS = Object.freeze([
  { key: 'hue',    label: 'barwa',            unit: '°', min: KEY_COLOUR_LIMITS.hue[0],    max: KEY_COLOUR_LIMITS.hue[1],    step: 1 },
  { key: 'hueTol', label: 'tolerancja barwy', unit: '°', min: KEY_COLOUR_LIMITS.hueTol[0], max: KEY_COLOUR_LIMITS.hueTol[1], step: 1 },
  { key: 'satMin', label: 'nasycenie od',     unit: '',  min: KEY_COLOUR_LIMITS.satMin[0], max: KEY_COLOUR_LIMITS.satMin[1], step: 0.01 },
  { key: 'valMin', label: 'jasność od',       unit: '',  min: KEY_COLOUR_LIMITS.valMin[0], max: KEY_COLOUR_LIMITS.valMin[1], step: 0.01 },
  { key: 'soft',   label: 'miękkość',         unit: '',  min: KEY_COLOUR_LIMITS.soft[0],   max: KEY_COLOUR_LIMITS.soft[1],   step: 0.01 },
  { key: 'gain',   label: 'wzmocnienie',      unit: '×', min: KEY_COLOUR_LIMITS.gain[0],   max: KEY_COLOUR_LIMITS.gain[1],   step: 0.1 },
]);

const quant = (x, step) => {
  const dec = step >= 1 ? 0 : Math.round(-Math.log10(step));
  return roundSym(Math.round(x / step) * step, dec);
};

/** Wartości suwaków z `keyColour` (przycięte do zakresów i skwantowane krokiem suwaka). */
export function slidersFromKeyColour(kc) {
  const out = {};
  for (const s of SLIDERS) {
    const v = Number.isFinite(kc?.[s.key]) ? kc[s.key] : KEY_COLOUR_DEFAULTS[s.key];
    out[s.key] = quant(clamp(v, s.min, s.max), s.step);
  }
  return out;
}

/** `keyColour` z wartości suwaków (+ tryb). Zawsze w zakresach schematu. */
export function keyColourFromSliders(values, mode = 'mask') {
  const kc = { mode: KEY_COLOUR_MODES.includes(mode) ? mode : 'mask' };
  for (const s of SLIDERS) {
    const v = Number(values?.[s.key]);
    kc[s.key] = quant(clamp(Number.isFinite(v) ? v : KEY_COLOUR_DEFAULTS[s.key], s.min, s.max), s.step);
  }
  return kc;
}

// ── zapis ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const STAMP_RE = /\s*·\s*Model Workshop \d{4}-\d{2}-\d{2}:[^·]*$/;

/** Dopisek Workshopu w `notes` — ZASTĘPUJE poprzedni dopisek (wielokrotny zapis nie dokleja kolejnych). */
export function stampNotes(notes, { date, weapons, lights }) {
  const base = String(notes ?? '').replace(STAMP_RE, '').trim();
  const s = `Model Workshop ${date}: wieżyczki ${weapons}, światła ${lights}.`;
  return base ? `${base} · ${s}` : s;
}

/**
 * Dokument hardpointów z dokumentu bazowego (wczytanego pliku) i stanu edycji. Zmienia WYŁĄCZNIE frame / nozzles / weapons /
 * lights / keyColour (+ notes, gdy podano datę); reszta (schema, version, slot, source, damagePoints) — bajt w bajt z bazy.
 * Współrzędne zaokrąglone symetrycznie do 4 miejsc. Wynik zawsze sprawdzony `validateHardpoints`.
 * @param {object} baseDoc
 * @param {object} edit
 * @param {{ date?: string|null }} [o] — data dopisku w notes (YYYY-MM-DD); null — notes bez zmian
 * @returns {{ ok: boolean, doc: object|null, errors: string[] }}
 */
export function docFromEdit(baseDoc, edit, { date = null } = {}) {
  const doc = buildDoc(baseDoc, edit, { date });
  const v = validateHardpoints(doc);
  return v.ok ? { ok: true, doc, errors: [] } : { ok: false, doc: null, errors: v.errors };
}

/** Sam montaż dokumentu (bez walidacji) — podgląd 3D na żywo; ZAPIS idzie wyłącznie przez `docFromEdit`. */
export function buildDoc(baseDoc, edit, { date = null } = {}) {
  const doc = clone(baseDoc ?? {});
  doc.frame = { bow: r4v(edit.frame.bow), up: r4v(edit.frame.up) };
  doc.nozzles = edit.nozzle ? [{ p: r4v(edit.nozzle.p), d: r4v(norm(edit.nozzle.d)), r: roundSym(edit.nozzle.r, 4) }] : [];
  doc.weapons = edit.weapons.map((w, i) => ({ id: 'W' + (i + 1), p: r4v(w.p), d: null }));
  doc.lights = edit.lights.map((l) => {
    const o = { p: r4v(l.p), size: roundSym(l.size, 4), colour: String(l.colour).toLowerCase() };
    if (Number.isFinite(l.gain)) o.gain = roundSym(l.gain, 2);
    return o;
  });
  doc.keyColour = keyColourFromSliders(slidersFromKeyColour(edit.keyColour), edit.keyColour.mode);
  if (date) doc.notes = stampNotes(doc.notes, { date, weapons: doc.weapons.length, lights: doc.lights.length });
  return doc;
}

/** Podpis stanu do porównań (czy są niezapisane zmiany): pola zapisu bez notes. */
export function editSignature(baseDoc, edit) {
  const r = docFromEdit(baseDoc, edit);
  const d = r.doc ?? {};
  return JSON.stringify([d.frame, d.nozzles, d.weapons, d.lights, d.keyColour, r.ok]);
}

// ── historia (cofnij / ponów) ─────────────────────────────────────────────────────────────────────────────────────────

export function createHistory(present, cap = HISTORY_CAP) { return { past: [], present, future: [], cap }; }

/** Nowy krok (czyści „ponów"); bez zmiany stanu — bez kroku. */
export function historyPush(h, next) {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  while (past.length > h.cap) past.shift();
  return { ...h, past, present: next, future: [] };
}
export function historyUndo(h) {
  if (!h.past.length) return h;
  return { ...h, past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function historyRedo(h) {
  if (!h.future.length) return h;
  return { ...h, past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;

// ── wybór istniejącego punktu (ekranowo) ──────────────────────────────────────────────────────────────────────────────

/**
 * Najbliższy punkt ekranowo w promieniu `maxPx`, z pominięciem zasłoniętych kadłubem i poza kadrem; przy remisie (± 1 px)
 * — bliższy kamerze. @param {Array<{x:number, y:number, depth:number, occluded?:boolean, inView?:boolean}>} pts
 * @returns {number} indeks albo −1
 */
export function pickNearest(pts, x, y, maxPx = 12) {
  let best = -1, bestD = Infinity, bestDepth = Infinity;
  pts.forEach((q, i) => {
    if (!q || q.occluded || q.inView === false) return;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d > maxPx) return;
    if (d < bestD - 1 || (Math.abs(d - bestD) <= 1 && q.depth < bestDepth)) { best = i; bestD = d; bestDepth = q.depth; }
  });
  return best;
}

// ── sesja (sessionStorage — zapis pliku przeładowuje stronę przez Live Server) ────────────────────────────────────────

/** Tekst do sessionStorage: slot, wariant, stan, historia (ostatnie kroki), podpis pliku przy wczytaniu, znacznik zapisu. */
export function sessionSnapshot({ slot, variant = 'slot', history, fileSig = null, savedSig = null, savedAt = null, ui = null }) {
  const keep = (arr, fromEnd) => (fromEnd ? arr.slice(-SESSION_HISTORY_KEEP) : arr.slice(0, SESSION_HISTORY_KEEP));
  return JSON.stringify({
    v: WORKSHOP_VERSION, slot, variant,
    history: { past: keep(history.past, true), present: history.present, future: keep(history.future, false) },
    fileSig, savedSig, savedAt, ui,
  });
}

const isEditShape = (e) => !!e && typeof e === 'object' && e.v === WORKSHOP_VERSION && e.frame && Array.isArray(e.weapons)
  && Array.isArray(e.lights) && e.keyColour && Number.isFinite(e.nextUid);

/** Odczyt sesji; cokolwiek niezgodnego ⇒ null (strona startuje od zera, zamiast się wywrócić). */
export function restoreSession(text) {
  let s;
  try { s = JSON.parse(text); } catch { return null; }
  if (!s || s.v !== WORKSHOP_VERSION || typeof s.slot !== 'string' || !/^[a-z0-9_]+$/.test(s.slot)) return null;
  if (s.variant !== 'slot' && s.variant !== 'incoming') return null;
  const h = s.history;
  if (!h || !isEditShape(h.present) || !Array.isArray(h.past) || !Array.isArray(h.future)) return null;
  if (![...h.past, ...h.future].every(isEditShape)) return null;
  return {
    slot: s.slot, variant: s.variant,
    history: { past: h.past, present: h.present, future: h.future, cap: HISTORY_CAP },
    fileSig: typeof s.fileSig === 'string' ? s.fileSig : null,
    savedSig: typeof s.savedSig === 'string' ? s.savedSig : null,
    savedAt: Number.isFinite(s.savedAt) ? s.savedAt : null,
    ui: s.ui && typeof s.ui === 'object' ? s.ui : null,
  };
}

// ── sloty (opisy po polsku — narzędzie poza i18n gry, jak raport normalizatora) ───────────────────────────────────────

const CLASS_PL = Object.freeze({
  small_science: 'mały naukowy', small_cargo: 'mały towarowy', small_colony: 'mały kolonizacyjny',
  medium_science: 'średni naukowy', medium_cargo: 'średni towarowy', medium_colony: 'średni kolonizacyjny',
  large_science: 'duży naukowy', large_cargo: 'duży towarowy', large_colony: 'duży kolonizacyjny',
  frigate: 'fregata', destroyer: 'niszczyciel', battleship: 'pancernik',
});
export const WARSHIP_CLASSES = Object.freeze(['frigate', 'destroyer', 'battleship']);

/** Opis slotu po polsku: 'warp_frigate' → 'fregata (z warp)'. */
export function slotLabelPL(slot) {
  if (slot === 'default') return 'zapasowy (default)';
  const m = /^(nonwarp|warp)_(.+)$/.exec(String(slot));
  if (!m || !CLASS_PL[m[2]]) return String(slot);
  return `${CLASS_PL[m[2]]} (${m[1] === 'warp' ? 'z warp' : 'bez warp'})`;
}

export const isWarshipSlot = (slot) => WARSHIP_CLASSES.some((c) => String(slot).endsWith('_' + c));

/** Sloty do wyboru: 24 sloty resolvera gry + `default` — ta sama kompozycja co `tools/ship-models/lib/slots.mjs` (`SHIP_SLOTS`;
 *  keeper porównuje). Strona Workshopu nie importuje `.mjs` (typ MIME z Live Server), więc lista składa się tu z tego samego źródła. */
export const WORKSHOP_SLOTS = Object.freeze([...VESSEL_MODEL_KEYS, 'default']);
