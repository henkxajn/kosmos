// geometry — czyste funkcje geometrii normalizatora modeli statków (ARC COMBAT VISUALS, krok CV-1b; plan §2.11, D-CV-13/14).
//
// Wszystko na zwykłych tablicach (pozycje jako płaska tablica xyz — Float32Array albo Array), ZERO zależności: keeper
// `cv_normalizer_logic_smoke` wykonuje te funkcje na syntetycznych siatkach w pamięci, CLI — na siatce z pliku GLB.
//
// PRZESTRZEŃ WYJŚCIOWA (ta sama, w której żyją hardpointy — `src/data/ShipHardpointsSchema.js`): środek prostopadłościanu
// otaczającego w (0, 0, 0), najdłuższy wymiar = 1,0, najdłuższa oś = X, DZIÓB W −X, góra +Y. Dziób −X to konwencja 26 z 27
// starych modeli (audyt Q6) i wartość zapasowa gry (`defaultHardpoints` — dziób −X), więc model po normalizacji leci dziobem
// naprzód także wtedy, gdy plik hardpointów by się nie wczytał, i na ścieżce `cvModels` OFF (dawny wzór kursu zakłada −X).
//
// OBRÓT — wyłącznie o wielokrotności 90° (macierz permutacji ze znakami, wyznacznik +1): prostopadłościan obrócony tak
// pozostaje prostopadłościanem o tym samym środku i tym samym najdłuższym wymiarze, więc punkt hardpointów zapisany
// w przestrzeni znormalizowanej SUROWEGO modelu przechodzi do przestrzeni wyjściowej jednym mnożeniem p' = R·p.

/** Ułamek długości przy końcach, w którym liczymy wierzchołki (zgadywanie dziobu): audyt Q6 — 27 / 27 trafień. */
export const BOW_SLICE_FRACTION = 0.08;
/** Ułamek długości przy rufie dla pomiaru dyszy (CV-1a: środek przekroju 3 % przy rufie). */
export const NOZZLE_SLICE_FRACTION = 0.03;
/** Stosunek liczności końców, poniżej którego zgadnięcie dziobu uznajemy za niepewne (raport każe sprawdzić w Workshopie). */
export const BOW_CONFIDENT_RATIO = 1.5;

const AXES = ['X', 'Y', 'Z'];
export const axisName = (i) => AXES[i] ?? '?';

/** Prostopadłościan otaczający płaskiej tablicy pozycji xyz. */
export function bboxOf(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

export const extentOf = (bb) => [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
export const centreOf = (bb) => [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];

/** Indeks najdłuższej osi (remis — niższy indeks, czyli X ma pierwszeństwo). */
export function longestAxisOf(bb) {
  const e = extentOf(bb);
  let k = 0;
  for (let i = 1; i < 3; i++) if (e[i] > e[k] + 1e-12) k = i;
  return k;
}

/**
 * Liczba wierzchołków w ostatnich `fraction` długości przy obu końcach osi.
 * @returns {{ atMin: number, atMax: number }}
 */
export function sliceCounts(positions, axis, fraction = BOW_SLICE_FRACTION, bb = bboxOf(positions)) {
  const lo = bb.min[axis], hi = bb.max[axis], cut = (hi - lo) * fraction;
  let atMin = 0, atMax = 0;
  for (let i = axis; i < positions.length; i += 3) {
    const v = positions[i];
    if (v <= lo + cut) atMin++;
    if (v >= hi - cut) atMax++;
  }
  return { atMin, atMax };
}

/**
 * Zgadnięcie dziobu wzdłuż osi: rufa = koniec z WIĘKSZĄ liczbą wierzchołków w ostatnich 8 % długości (dysze, dzwony
 * silników, detal maszynowni), dziób = koniec z mniejszą (zwężony albo gładki nos). Audyt Q6: 27 / 27 na starych modelach;
 * CV-1a: sześć modeli właściciela (165 / 2 264 … 47 / 3 335).
 * @returns {{ sign: -1|1, atMin: number, atMax: number, ratio: number, confident: boolean }} sign = zwrot dziobu na osi
 */
export function guessBow(positions, axis, { fraction = BOW_SLICE_FRACTION, bb = bboxOf(positions) } = {}) {
  const { atMin, atMax } = sliceCounts(positions, axis, fraction, bb);
  const sign = atMin <= atMax ? -1 : 1;
  const ratio = Math.max(atMin, atMax) / Math.max(1, Math.min(atMin, atMax));
  return { sign, atMin, atMax, ratio, confident: ratio >= BOW_CONFIDENT_RATIO };
}

// ── macierze (3×3 jako wiersze [[..],[..],[..]], 4×4 kolumnowo jak glTF / gl-matrix) ─────────────────────────────────

export const IDENTITY3 = Object.freeze([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);

export function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
       - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
       + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

/** R·v dla macierzy 3×3 (wiersze). */
export function mul3v(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Czy macierz jest obrotem o wielokrotność 90° (permutacja ze znakami, wyznacznik +1). */
export function isSignedPermutation(m) {
  for (let r = 0; r < 3; r++) {
    let nz = 0;
    for (let c = 0; c < 3; c++) { const v = m[r][c]; if (v !== 0) { if (Math.abs(v) !== 1) return false; nz++; } }
    if (nz !== 1) return false;
  }
  return det3(m) === 1;
}

/** Dominująca oś i znak wektora: [0.1, -0.9, 0.2] → { axis: 1, sign: -1 }. */
export function dominantAxis(v) {
  let k = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(v[i]) > Math.abs(v[k])) k = i;
  return { axis: k, sign: v[k] < 0 ? -1 : 1 };
}

/**
 * Obrót (permutacja ze znakami, det +1) przenoszący dziób na −X, a górę na +Y.
 * @param {{ bowAxis: number, bowSign: -1|1, upAxis?: number, upSign?: -1|1 }} o — osie i zwroty w przestrzeni SUROWEJ
 * @returns {{ R: number[][], warnings: string[] }}
 */
export function orientationFor({ bowAxis, bowSign, upAxis = 1, upSign = 1 }) {
  const warnings = [];
  let ua = upAxis, us = upSign;
  if (ua === bowAxis) {
    // Najdłuższa oś = „góra" (model stoi pionowo): góra przechodzi na następną oś — raport każe sprawdzić w Workshopie.
    ua = bowAxis === 1 ? 2 : 1; us = 1;
    warnings.push('up_was_bow_axis');
  }
  const wa = 3 - bowAxis - ua;
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  R[0][bowAxis] = -bowSign;   // dziób (bowSign · e_bow) → −X
  R[1][ua] = us;              // góra (us · e_up) → +Y
  R[2][wa] = 1;
  if (det3(R) < 0) R[2][wa] = -1;   // układ prawoskrętny (det +1) — obrót, nie lustro
  return { R, warnings };
}

/**
 * Macierz 4×4 (kolumnowo, jak glTF) normalizacji: przesunięcie środka bbox do (0,0,0), obrót R, skala 1 / najdłuższy wymiar.
 * out = R · (p − c) / L
 */
export function normalizationMatrix(bb, R = IDENTITY3) {
  const c = centreOf(bb), e = extentOf(bb);
  const L = Math.max(e[0], e[1], e[2]) || 1;
  const s = 1 / L;
  const t = mul3v(R, c).map((x) => -x * s);
  return [
    R[0][0] * s, R[1][0] * s, R[2][0] * s, 0,
    R[0][1] * s, R[1][1] * s, R[2][1] * s, 0,
    R[0][2] * s, R[1][2] * s, R[2][2] * s, 0,
    t[0], t[1], t[2], 1,
  ];
}

/** Punkt przez macierz 4×4 (kolumnowo). */
export function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Nowa płaska tablica pozycji po macierzy 4×4. */
export function transformPositions(m, positions) {
  const out = new Float64Array(positions.length);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const p = transformPoint(m, [positions[i], positions[i + 1], positions[i + 2]]);
    out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
  }
  return out;
}

const r3 = (x) => Math.round(x * 1000) / 1000 + 0;   // + 0: bez „-0" w JSON

/** Ułamek długości przy rufie dla PROMIENIA dyszy (koniec dzwonu silnika). */
export const NOZZLE_R_SLICE_FRACTION = 0.01;
/** Promień dyszy [przestrzeń znormalizowana]: przedział — dysza nigdy znikoma ani szersza niż kadłub frachtowca. */
export const NOZZLE_R_RANGE = Object.freeze([0.02, 0.12]);

function crossExtent(positions, fraction, hiX, lenX) {
  const smin = [Infinity, Infinity], smax = [-Infinity, -Infinity];
  let n = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (positions[i] < hiX - lenX * fraction) continue;
    n++;
    for (let k = 0; k < 2; k++) {
      const v = positions[i + 1 + k];
      if (v < smin[k]) smin[k] = v;
      if (v > smax[k]) smax[k] = v;
    }
  }
  return { n, smin, smax };
}

/**
 * Dysza z przekroju przy rufie (przestrzeń wyjściowa: dziób −X, rufa +X): punkt = koniec rufy w osi, środek bbox przekroju
 * 3 % w poprzek (ta sama reguła dała pozycje dysz w plikach CV-1a — zgodność 33 / 33 w pomiarze 2026-11-11); promień = połowa
 * MNIEJSZEJ szerokości przekroju 1 % (koniec dzwonu), w przedziale `NOZZLE_R_RANGE` (promienie CV-1a nie mają zapisanej
 * reguły — ta daje średni błąd ≈ 0,014 wobec nich; promień to tylko grubość smugi, którą i tak stroi `MODEL_PLUME_R_*`).
 * @returns {{ p: number[], d: number[], r: number, sliceVerts: number }}
 */
export function measureNozzle(positions, { fraction = NOZZLE_SLICE_FRACTION, rFraction = NOZZLE_R_SLICE_FRACTION } = {}) {
  const bb = bboxOf(positions);
  const hi = bb.max[0], len = bb.max[0] - bb.min[0];
  const s = crossExtent(positions, fraction, hi, len);
  if (!s.n) return { p: [r3(hi), 0, 0], d: [1, 0, 0], r: NOZZLE_R_RANGE[0] * 2, sliceVerts: 0 };
  const cy = (s.smin[0] + s.smax[0]) / 2, cz = (s.smin[1] + s.smax[1]) / 2;
  const t = crossExtent(positions, rFraction, hi, len);
  const half = t.n ? Math.min(t.smax[0] - t.smin[0], t.smax[1] - t.smin[1]) / 2 : 0;
  const r = Math.max(NOZZLE_R_RANGE[0], Math.min(NOZZLE_R_RANGE[1], half));
  return { p: [r3(hi), r3(cy), r3(cz)], d: [1, 0, 0], r: r3(r), sliceVerts: s.n };
}
