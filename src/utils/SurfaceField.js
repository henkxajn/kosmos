// SurfaceField — czysty silnik powierzchni ciała (ARC COLONY SPHERE, krok CS-4a; COLONY_SPHERE_PLAN §1.I, §2, §3.4,
// D-CS-3, D-CS-16).
//
// Jedna ciągła powierzchnia KAŻDEGO ciała (planeta / księżyc / planetoida) z (surfaceSeed, wiersz archetypu,
// parametry ciała). Konsumenci (jeszcze NIE podpięci): CS-4b (worker + SurfaceCache), CS-5 (teren kafli
// GeodesicGrid = classify(evalAt(środek kafla))), CS-6 (SurfaceShader czyta bakeEquirect).
//
// ── Zasady (D-CS-16, §1.I) ──────────────────────────────────────────────────────────────────────────────────────
//  • Moduł BEZ importów i bez efektów ubocznych na poziomie modułu (bez three, GameConfig, i18n, document, window)
//    → działa w module workerze (CS-4b) i pod node. Wiersz archetypu podaje wołający (BodyArchetypes.js).
//  • Ścieżka ROZGRYWKI — evalAt / classify / seaLevelOf / surfaceInfo / fibonacciSphere — używa WYŁĄCZNIE
//    + − × ÷ sqrt floor (oraz dokładnych abs/min/max/imul i operacji bitowych na int32). ŻADNEGO sin/cos/tan/atan2/
//    asin/acos/pow/exp/log ani operatora potęgi: ECMAScript nie gwarantuje ich bit-identyczności między silnikami,
//    a teren kafla musi być ten sam w Chrome i Firefoksie. Pilnuje tego keeper (pin źródła + pułapka w czasie
//    wykonania).
//  • bakeEquirect (tekstura wizualna) MOŻE używać trygonometrii (kosmetyka) — tylko do wektora piksela; samo pole
//    liczy ta sama arytmetyczna funkcja co evalAt.
//  • Determinizm: permutacje simplex z ziarna (hash całkowity splitmix + mulberry32), stałe złotego kąta jako literały,
//    kalibracja poziomu morza na stałym zbiorze punktów Fibonacciego (arytmetyka), sortowanie typowanej tablicy.
//
// ── Próbka {e, m, t, a} — wszystkie kanały w [0, 1] ──────────────────────────────────────────────────────────────
//  e — wysokość (morze: e < seaLevel), m — wilgotność / skład / maska cechy (szczeliny, lawa, żyły), t — temperatura
//  (szerokość + wysokość; związana pływowo: strona dzienna), a — profil krateru / kopuły (0.5 = brak; < 0.5 dno,
//  > 0.5 wał lub stożek; Io: plama patery). Znaczenie m / a zależy od przepisu (`field.recipe`), opis przy przepisie.
//
// ── Konwencja equirect (bakeEquirect) ───────────────────────────────────────────────────────────────────────────
//  piksel (i, j): lon = ((i + 0.5)/w)·2π − π, lat = π/2 − ((j + 0.5)/h)·π (północ u góry),
//  wektor = (cos lon · cos lat, sin lat, sin lon · cos lat). Kanały RGBA8 = e, m, t, a (bajt = round(v·255)).
//  Związana pływowo: punkt podgwiazdowy = +x (lon 0, środek mapy).

/** Wersja pola — zmiana wyglądu / terenu podbija ją (CS-4b: klucz cache). */
export const SURFACE_FIELD_VERSION = 4;

/** 10 terenów rozgrywki (HexTile.js; D-CS-3) — classify zwraca zawsze jeden z nich. */
export const GAMEPLAY_TERRAINS = Object.freeze(['plains', 'mountains', 'ocean', 'forest', 'desert', 'tundra',
  'volcano', 'crater', 'ice_sheet', 'wasteland']);

/** Rozmiary LOD bake'u (§1.I): bohater kolonii, planety/księżyce na mapie układu, planetoidy. */
export const LOD_SIZES = Object.freeze({
  hero:      Object.freeze([1024, 512]),
  body:      Object.freeze([256, 128]),
  planetoid: Object.freeze([128, 64]),
});

/** Liczba punktów Fibonacciego kalibracji poziomu morza (stała — zmiana = inny teren). */
export const SEA_CALIBRATION_POINTS = 4096;

/**
 * Normalizacja wysokości rodziny terran (Finding 771, v3): surowe e przepisu jest odwzorowane afinicznie tak, że
 * kwantyl `qLo` próby kalibracyjnej trafia w `lo`, a kwantyl `qHi` w `hi`. Kanał e nie nasyca się już na 1.0, więc
 * wysokość nad morzem h = (e − sea) / (1 − sea) ma gradient na całym lądzie przy każdym pokryciu wodą.
 */
export const ELEVATION_NORM = Object.freeze({ qLo: 0.01, qHi: 0.995, lo: 0.05, hi: 0.95, hiSpread: 0.12 });

// Złoty kąt π(3 − √5) [rad] — cos i sin jako LITERAŁY (keeper sprawdza je względem Math.cos/sin po stronie testu).
const GOLDEN_COS = -0.7373688780783197;
const GOLDEN_SIN = 0.6754902942615238;

const U32 = 1 / 4294967296;

// ── Hash całkowity ──────────────────────────────────────────────────────────────────────────────────────────────
// Finalizer splitmix32 (to samo co SeedMath.mixSeed — tu kopia, bo moduł nie ma importów).
function mix32(n) {
  let z = n >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

// Hash komórki sieci 3D (kratery, plamy) — tylko imul / xor / przesunięcia.
function cellHash(ix, iy, iz, salt) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ salt) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Ułamek [0, 1) z ziarna i soli.
function unitOf(seed, salt) { return mix32((seed ^ salt) >>> 0) * U32; }

// ── Simplex 3D (Gustavson/Stegu, port z lib/noise.js SimplexNoise3DFallback — lib/ nietknięty) ──────────────────
const F3 = 1 / 3, G3 = 1 / 6;
const GX = Int8Array.of(1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0);
const GY = Int8Array.of(1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1);
const GZ = Int8Array.of(0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1);

// Permutacja z ziarna: mulberry32 (dzielenie przez 2³² jest dokładne) + Fisher–Yates.
function makePerm(seed) {
  let s = mix32(seed) | 0;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) * U32;
    const j = Math.floor(r * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
  return { perm, pm };
}

function simplex3(N, x, y, z) {
  const perm = N.perm, pm = N.pm;
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0;
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) { const g = pm[ii + perm[jj + perm[kk]]]; t0 *= t0; n += t0 * t0 * (GX[g] * x0 + GY[g] * y0 + GZ[g] * z0); }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]; t1 *= t1; n += t1 * t1 * (GX[g] * x1 + GY[g] * y1 + GZ[g] * z1); }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) { const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]; t2 *= t2; n += t2 * t2 * (GX[g] * x2 + GY[g] * y2 + GZ[g] * z2); }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) { const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]; t3 *= t3; n += t3 * t3 * (GX[g] * x3 + GY[g] * y3 + GZ[g] * z3); }
  return 32 * n;   // ≈ [-1, 1]
}

// fBm: lacunarity 2, gain 0.5 (jak prototyp colony-sphere.html).
function fbm(N, x, y, z, oct) {
  let s = 0, a = 1, f = 1, w = 0;
  for (let o = 0; o < oct; o++) { s += a * simplex3(N, x * f, y * f, z * f); w += a; a *= 0.5; f *= 2; }
  return s / w;
}

// Ridged multifractal (lib/noise.js ridgedFbm3d) — ostre grzbiety, kaskada.
function ridged(N, x, y, z, oct) {
  let s = 0, a = 1, f = 1, w = 0, prev = 1;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(simplex3(N, x * f, y * f, z * f));
    n *= n; n *= prev; prev = n;
    s += a * n; w += a; a *= 0.5; f *= 2;
  }
  return s / w;
}

// Cienka linia (szczelina, kanał lawy): (1 − |n|)^16 przez czterokrotne podniesienie do kwadratu.
function lineMask(N, x, y, z) {
  let k = 1 - Math.abs(simplex3(N, x, y, z));
  k *= k; k *= k; k *= k; k *= k;
  return k;
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// Wspólny bufor zniekształcenia domeny (moduł jednowątkowy — worker ma własną kopię modułu).
const W = new Float64Array(3);

// Domain warp (lib/noise.js domainWarp3d, wariant prototypu: 3 × fbm 3 oktawy) → W.
function warp(c, x, y, z, freq, strength) {
  const o = c.o, N = c.n1;
  const X = x * freq, Y = y * freq, Z = z * freq;
  W[0] = x + strength * fbm(N, X + o[0], Y + o[1], Z + o[2], 3);
  W[1] = y + strength * fbm(N, X + o[3], Y + o[4], Z + o[5], 3);
  W[2] = z + strength * fbm(N, X + o[6], Y + o[7], Z + o[8], 3);
}

// ── Kratery (port idei lib/craters.js na komórki sieci 3D — ewaluacja punktowa, bez listy kraterów) ─────────────
// Zwraca profil ze znakiem: misa q² − 1 (−1 w środku), wał +0.55·(1 − w²)² wokół q = 1. dome = kopuła 1 − q²
// (stożek wulkanu / plama patery: wartość dodatnia).
function craterLayer(x, y, z, freq, salt, density, dome) {
  const X = x * freq, Y = y * freq, Z = z * freq;
  const cx = Math.floor(X), cy = Math.floor(Y), cz = Math.floor(Z);
  let best = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ix = cx + dx, iy = cy + dy, iz = cz + dz;
        const h = cellHash(ix, iy, iz, salt);
        if (h * U32 >= density) continue;
        const h1 = mix32(h ^ 0x68e31da4), h2 = mix32(h1 ^ 0xb5297a4d), h3 = mix32(h2 ^ 0x1b56c4e9), h4 = mix32(h3 ^ 0x9e3779b9);
        const fx = ix + h1 * U32 - X, fy = iy + h2 * U32 - Y, fz = iz + h3 * U32 - Z;
        const r = 0.16 + 0.30 * (h4 * U32);
        const d2 = fx * fx + fy * fy + fz * fz;
        const lim = r * 1.3;
        if (d2 >= lim * lim) continue;
        const q = Math.sqrt(d2) / r;
        let v;
        if (dome) {
          v = q < 1 ? 1 - q * q : 0;
        } else {
          v = q < 1 ? q * q - 1 : 0;
          const w = (q - 1) / 0.2;
          if (w > -1 && w < 1) { const b = 1 - w * w; v += 0.55 * b * b; }
        }
        if (Math.abs(v) > Math.abs(best)) best = v;
      }
    }
  }
  return best;
}

// Trzy skale kraterów (prototyp: 4.5 / 10 / 21), gęstość = field.craterDensity × zmienność z ziarna.
function craters(c, x, y, z, density) {
  if (!(density > 0)) return 0;
  const f = c.v.craterFreq * c.f.craterScale;
  return craterLayer(x, y, z, 2.2 * f, c.salt[3], density * 0.5, false) * 1.2
    + craterLayer(x, y, z, 4.5 * f, c.salt[0], density * 0.9, false)
    + 0.65 * craterLayer(x, y, z, 10 * f, c.salt[1], density, false)
    + 0.35 * craterLayer(x, y, z, 21 * f, c.salt[2], density, false);
}

// Wielki krater / basen (planetoidy ≈ 1 na 6, ciała bez atmosfery — `field.basinChance`); pozycja i promień z ziarna.
function giantCrater(c, x, y, z) {
  if (!c.v.giant) return 0;
  const dx = x - c.v.gx, dy = y - c.v.gy, dz = z - c.v.gz;
  const q = Math.sqrt(dx * dx + dy * dy + dz * dz) / c.v.gr;
  if (q >= 1.4) return 0;
  let v = q < 1 ? (q * q - 1) * 0.8 : 0;
  const w = (q - 1) / 0.18;
  if (w > -1 && w < 1) { const b = 1 - w * w; v += 0.6 * b * b; }
  return v;
}

// ── Przepisy powierzchni (recipe) — piszą surowe e, m, t, a do `out`; sampleInto obcina do [0, 1] ──────────────
// Wspólne: c.freq = bazowa częstotliwość × zmienność z ziarna; c.f = field archetypu; c.sea = poziom morza
// (e NIGDY nie zależy od c.sea — kalibracja liczy e przed jego ustaleniem).

// terran / ocean / jungle — kontynenty z zniekształconego fBm; m wilgotność; t szerokość − wysokość nad morzem.
function rTerran(c, x, y, z, out) {
  const f = c.f, fr = c.freq;
  warp(c, x, y, z, 1.2, 1.2 * f.warp * c.v.warp);
  const qx = W[0], qy = W[1], qz = W[2], o = c.o;
  const cont = fbm(c.n1, qx * 0.55 + o[8], qy * 0.55, qz * 0.55, 3);
  let e = 0.5 + cont * 0.9 * f.continent + fbm(c.n0, qx * fr, qy * fr, qz * fr, f.octaves) * 0.9 * (1 - 0.65 * f.continent);
  const r = 1 - Math.abs(simplex3(c.n2, qx * 2.6 + o[1], qy * 2.6, qz * 2.6));
  e += Math.max(0, e - 0.55) * r * r * r * 0.6 * f.ridge;
  if (f.islands > 0) e += (ridged(c.n2, qx * 3.1 + o[2], qy * 3.1, qz * 3.1, 3) - 0.35) * f.islands;
  e = c.eA + c.eB * e;   // v3 (771): normalizacja z kalibracji; w trakcie kalibracji eA = 0, eB = 1 (surowe e)
  out[0] = e;
  out[1] = 0.5 + f.wetBias + fbm(c.n2, x * 2.1 + o[4], y * 2.1 + o[5], z * 2.1 + o[6], 4) * 1.15;
  out[2] = 1 - (1 - f.tropic) * y * y + fbm(c.n1, x * 2.5 + o[7], y * 2.5, z * 2.5, 3) * 0.22 - Math.max(0, e - c.sea) * 0.12;
  out[3] = 0.5;
}

// desert (Mars) — dychotomia półkul, basen, kratery, ciemne / jasne regiony (m), małe czapy polarne (t).
function rDesert(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  warp(c, x, y, z, 1.0, 1.2 * f.warp * c.v.warp);
  const cr = craters(c, x, y, z, f.craterDensity * c.v.craterMul) + giantCrater(c, x, y, z);
  let e = 0.5 + fbm(c.n0, W[0] * fr, W[1] * fr, W[2] * fr, f.octaves) * 0.5;
  e += (ridged(c.n2, x * 2.4 + o[3], y * 2.4, z * 2.4, 4) - 0.3) * 0.25 * f.ridge;
  e += fbm(c.n1, x * 0.7 + o[5], y * 0.7, z * 0.7, 2) * 0.25 - 0.08 * y;
  e += cr * f.craterDepth;
  out[0] = e;
  out[1] = 0.5 + fbm(c.n2, x * 1.3 + o[6], y * 1.3 + o[7], z * 1.3 + o[8], 4) * 1.5;
  out[2] = 1 - y * y + fbm(c.n1, x * 4 + o[1], y * 4, z * 4, 2) * 0.05;
  out[3] = 0.5 + cr * 0.35;
}

// ice — lodowa skorupa: grzbiety (ridged), kriowulkany, odsłonięta skała w niskich szerokościach (m).
function rIce(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  warp(c, x, y, z, 1.3, 1.2 * f.warp * c.v.warp);
  const cr = craters(c, x, y, z, f.craterDensity * c.v.craterMul);
  const rf = c.v.regionFreq;
  const region = fbm(c.n2, x * rf + o[4], y * rf + o[5], z * rf + o[6], 4) + c.v.iceBias;
  const smoothPlain = smooth(-0.05, -0.2, region);   // gładkie zamarznięte równiny: niżej, bez grzbietów
  let e = 0.42 + fbm(c.n0, W[0] * fr, W[1] * fr, W[2] * fr, f.octaves) * 0.5 - smoothPlain * 0.08;
  const iq = c.v.iceRidgeFreq;
  e += (ridged(c.n2, x * iq + o[2], y * iq, z * iq, 4) - 0.3) * 0.5 * f.ridge * c.v.iceRidge * (1 - 0.8 * smoothPlain) + cr * 0.05;
  const rift = f.rifts * c.v.riftMul * Math.max(lineMask(c.n1, W[0] * 1.1 * rf + o[7], W[1] * 1.1 * rf, W[2] * 1.1 * rf),
    0.6 * lineMask(c.n1, W[0] * 2.3 + o[8], W[1] * 2.3, W[2] * 2.3));
  out[0] = e;
  out[1] = 0.5 + region * 1.4 * f.oldIce;
  out[2] = 1 - y * y;
  out[3] = Math.max(0.5 + cr * 0.35, 0.5 + 0.5 * rift);
}

// volcanic — sieć kanałów lawy (m = maska lawy), kaldery (a), bazaltowe grzbiety; t = żar.
function rVolcanic(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  warp(c, x, y, z, 1.1, 1.2 * f.warp * c.v.warp);
  const qx = W[0], qy = W[1], qz = W[2];
  let e = 0.5 + fbm(c.n0, qx * fr, qy * fr, qz * fr, f.octaves) * 0.45 + fbm(c.n1, x * 0.6 + o[0], y * 0.6 + o[1], z * 0.6 + o[2], 3) * 0.4;
  e += (ridged(c.n2, qx * 2.8 + o[1], qy * 2.8, qz * 2.8, 4) - 0.3) * 0.3 * f.ridge;
  const lf = c.v.lavaFreq;
  const lava = Math.max(lineMask(c.n2, qx * 1.6 * lf + o[3], qy * 1.6 * lf, qz * 1.6 * lf), 0.8 * lineMask(c.n1, qx * 3.4 * lf + o[4], qy * 3.4 * lf, qz * 3.4 * lf)) * c.v.lavaMul;
  const cald = craterLayer(x, y, z, 3.2 * c.v.craterFreq, c.salt[3], f.calderas, false);
  const m = lava * 1.2 * f.lava + Math.max(0, c.v.lavaBasin - e) * 2.5 * f.lava;
  out[0] = e - Math.min(1, m) * 0.06 + cald * 0.05;
  out[1] = m;
  out[2] = 0.3 + 0.7 * Math.min(1, m);
  out[3] = 0.5 + cald * 0.35;
}

// hothouse (Wenus bez chmur) — równiny, wyżyny-kontynenty, stożki wulkanów siarkowych (a > 0.5).
function rHothouse(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  warp(c, x, y, z, 1.0, 1.2 * f.warp * c.v.warp);
  let e = 0.48 + fbm(c.n0, W[0] * fr, W[1] * fr, W[2] * fr, f.octaves) * 0.45;
  e += 0.24 * smooth(0.12, 0.32, fbm(c.n1, x * 0.8 + o[2], y * 0.8, z * 0.8, 3));
  e += (ridged(c.n2, x * 3.6 + o[5], y * 3.6, z * 3.6, 3) - 0.3) * 0.18 * f.ridge;
  const cone = craterLayer(x, y, z, 3.4 * c.v.craterFreq, c.salt[3], f.volcanoes, true);
  out[0] = e + cone * 0.12;
  out[1] = 0.5 + fbm(c.n2, x * 2.4 + o[6], y * 2.4 + o[7], z * 2.4 + o[8], 4) * 1.2;
  out[2] = 0.85 + fbm(c.n1, x * 3 + o[1], y * 3, z * 3, 2) * 0.1;
  out[3] = 0.5 + cone * 0.5;
}

// cryo_haze / hazy_moon (Tytan) — jeziora metanu przy biegunach (e obniżone ku biegunom), wydmy przy równiku (t),
// jasne skały lodu wodnego (m).
function rCryoHaze(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  warp(c, x, y, z, 1.1, 1.2 * f.warp * c.v.warp);
  const cr = craters(c, x, y, z, f.craterDensity * c.v.craterMul);
  let e = 0.55 + fbm(c.n0, W[0] * fr, W[1] * fr, W[2] * fr, f.octaves) * 0.45 - f.polarLow * y * y * y * y;
  e += (ridged(c.n2, x * 2.8 + o[2], y * 2.8, z * 2.8, 3) - 0.3) * 0.25 * f.ridge + cr * 0.04;
  out[0] = e;
  out[1] = 0.5 + fbm(c.n2, x * 1.6 + o[4], y * 1.6 + o[5], z * 1.6 + o[6], 4) * 1.3;
  out[2] = 1 - y * y + fbm(c.n1, x * 3.5 + o[7], y * 3.5, z * 3.5, 2) * 0.08;
  out[3] = 0.5 + cr * 0.35;
}

// scorched / barren / rocky_cratered / icy_cratered / planetoid* — ciała bez atmosfery: kratery na trzech skalach,
// basen z ziarna, m = maria (Księżyc) / skarpy (Merkury) / ciemne plamy (Kallisto) / żyły metalu (planetoidy).
function rCratered(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  const base = fbm(c.n0, x * fr, y * fr, z * fr, f.octaves);
  let m = 0;
  if (f.maria > 0) {
    const mf = fbm(c.n1, x * 0.8 + o[0], y * 0.8 + o[1], z * 0.8 + o[2], 3) * 0.5 + 0.5;
    m = smooth(0.62 - 0.1 * f.maria, 0.66 - 0.1 * f.maria, mf);
  } else if (f.scarps > 0) {
    m = Math.max(lineMask(c.n2, x * 1.8 + o[3], y * 1.8, z * 1.8), 0.7 * lineMask(c.n1, x * 3.6 + o[4], y * 3.6, z * 3.6)) * f.scarps;
  } else if (f.veins > 0) {
    let k = 1 - Math.abs(simplex3(c.n2, x * 3.5 + o[0], y * 3.5, z * 3.5));
    const k2 = k * k, k4 = k2 * k2; k = k4 * k2 * k;               // (1 − |n|)^7 jak prototyp
    m = k * f.veins * c.v.veinMul;
  } else if (f.patches > 0) {
    m = 0.5 + fbm(c.n2, x * 2.4 + o[5], y * 2.4 + o[6], z * 2.4 + o[7], 4) * 1.2 * f.patches;
  }
  const flooded = f.maria > 0 ? m : 0;
  // Region: 1 = stare, gęsto pokraterowane wyżyny, 0 = młodsze równiny (mniej kraterów; scorched: lawa).
  const reg = f.regional > 0 ? smooth(-0.18, 0.18, fbm(c.n1, x * 0.9 + o[6], y * 0.9 + o[7], z * 0.9 + o[8], 3) + c.v.regBias) : 1;
  const dens = f.craterDensity * c.v.craterMul * (1 - f.regional * f.regionalDepth * (1 - reg)) * (1 + f.highlandBoost * reg);
  const plains = f.lavaPlains * (1 - reg);
  const cr = craters(c, x, y, z, dens) * (1 - 0.65 * flooded) + giantCrater(c, x, y, z);
  out[0] = 0.55 + base * f.relief * (1 - 0.7 * plains) - flooded * 0.08 - plains * 0.26 + cr * f.craterDepth + (f.scarps > 0 ? m * 0.08 : 0);
  out[1] = m;
  out[2] = 1 - (1 - f.tropic) * y * y;
  out[3] = 0.5 + cr * 0.35;
}

// tidally_locked — strona dzienna wokół +x, pas terminatora, lodowa strona nocna; t = oświetlenie.
function rTidal(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  const cr = craters(c, x, y, z, f.craterDensity * c.v.craterMul);
  let e = 0.5 + fbm(c.n0, x * fr, y * fr, z * fr, f.octaves) * 0.45 + cr * 0.05;
  e += (ridged(c.n2, x * 2.6 + o[2], y * 2.6, z * 2.6, 3) - 0.3) * 0.2 * f.ridge;
  const v = c.v;
  const d = (x + v.tTilt * z + v.tLat * y) / v.tTiltLen + fbm(c.n1, x * 1.6 + o[5], y * 1.6 + o[6], z * 1.6 + o[7], 4) * v.tWobble;
  out[0] = e;
  out[1] = v.tWater ? 0.5 + (0.47 - e) * 4 : 0.3 + fbm(c.n2, x * 2.4 + o[3], y * 2.4 + o[4], z * 2.4, 4) * 0.6;
  out[2] = 0.5 + 0.5 * (d - v.tShift) * v.tSlope;
  out[3] = 0.5 + cr * 0.35;
}

// volcanic_moon (Io) — siarkowe równiny (m = odcień siarki), patery (a = plama 0.5…1, rdzeń = jezioro lawy),
// pojedyncze góry krzemianowe.
function rIo(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  const spot = Math.max(craterLayer(x, y, z, 4.0 * c.v.craterFreq, c.salt[3], f.paterae, true),
    0.8 * craterLayer(x, y, z, 8.5 * c.v.craterFreq, c.salt[4], f.paterae, true));
  let e = 0.5 + fbm(c.n0, x * fr, y * fr, z * fr, f.octaves) * 0.3;
  e += 0.35 * smooth(0.28, 0.45, fbm(c.n2, x * 2.2 + o[1], y * 2.2, z * 2.2, 4)) * f.ridge;
  out[0] = e - spot * 0.05;
  out[1] = 0.5 + fbm(c.n1, x * 2.6 + o[3], y * 2.6 + o[4], z * 2.6 + o[5], 4) * 1.3;
  out[2] = 0.4 + 0.6 * spot;
  out[3] = 0.5 + spot * 0.5;
}

// icy_cracked (Europa) — gładki lód, sieć lineae (m = maska szczelin, trzy skale), plamy terenu chaosu (e).
function rEuropa(c, x, y, z, out) {
  const f = c.f, fr = c.freq, o = c.o;
  warp(c, x, y, z, 0.9, 1.2 * f.warp * c.v.warp);
  const qx = W[0], qy = W[1], qz = W[2];
  const cracks = Math.max(lineMask(c.n2, qx * 1.3 + o[0], qy * 1.3, qz * 1.3),
    0.85 * lineMask(c.n1, qx * 2.7 + o[1], qy * 2.7, qz * 2.7),
    0.7 * lineMask(c.n2, qx * 5.5 + o[2], qy * 5.5, qz * 5.5)) * f.cracks;
  const chaos = smooth(0.2, 0.3, fbm(c.n1, x * 1.8 + o[4], y * 1.8 + o[5], z * 1.8 + o[6], 3));
  const cr = craters(c, x, y, z, f.craterDensity * c.v.craterMul);
  let e = 0.45 + fbm(c.n0, x * fr, y * fr, z * fr, f.octaves) * 0.22 + chaos * (0.22 + 0.15 * simplex3(c.n2, x * 9, y * 9, z * 9));
  e += (ridged(c.n2, qx * 4 + o[7], qy * 4, qz * 4, 3) - 0.3) * 0.12 * f.ridge + cr * 0.04;
  out[0] = e;
  out[1] = cracks;
  out[2] = 1 - y * y;
  out[3] = 0.5 + cr * 0.35;
}

// gazowy (poza zakresem CS-4a — GasGiantShader zostaje; tylko dla totalności) — pasma szerokości.
function rGas(c, x, y, z, out) {
  out[0] = 0.5 + fbm(c.n0, x * 0.6, y * 7 + c.o[0], z * 0.6, 3) * 0.6;
  out[1] = 0.5; out[2] = 0.5; out[3] = 0.5;
}

const RECIPES = Object.freeze({
  terran: rTerran, ocean: rTerran, jungle: rTerran,
  desert: rDesert, ice: rIce, volcanic: rVolcanic, hothouse: rHothouse,
  cryo_haze: rCryoHaze, hazy_moon: rCryoHaze,
  scorched: rCratered, barren: rCratered, rocky_cratered: rCratered, icy_cratered: rCratered,
  planetoid: rCratered, planetoid_icy: rCratered,
  tidally_locked: rTidal, volcanic_moon: rIo, icy_cracked: rEuropa,
  gas: rGas,
});

// ── Klasyfikacja próbki → klasa biomu archetypu (D-CS-3: teren = tabela biomów wiersza) ────────────────────────
// Każdy klasyfikator kończy się bezwarunkowym return → funkcja totalna (także dla NaN).
// capT = próg czapy polarnej z field.polarCapBias (0 → 0.06, 1 → 0.26).

function cTerran(s, sea, f) {
  const capT = 0.06 + 0.2 * f.polarCapBias;
  if (s.e < sea) {
    if (s.t < capT - 0.04) return 'pack_ice';
    return s.e < sea - 0.05 ? 'deep_sea' : 'shallow_sea';
  }
  if (s.t < capT) return 'glacier';
  const h = (s.e - sea) / (1 - sea);
  // Linia śniegu rośnie ku równikowi (t ≈ 1 → ponad 1 = brak śnieżnych szczytów w tropikach).
  if (h > 0.45 + 0.7 * s.t) return 'peaks';
  if (h > 0.54) return 'mountains';
  if (s.t < capT + 0.16) return 'tundra';
  if (s.m < 0.33) return 'steppe';
  if (s.m < 0.6) return 'plains';
  return 'forest';
}
function cOcean(s, sea, f) {
  const capT = 0.06 + 0.2 * f.polarCapBias;
  if (s.e < sea) {
    if (s.t < capT - 0.04) return 'pack_ice';
    return s.e < sea - 0.04 ? 'deep_sea' : 'shallow_sea';
  }
  const h = (s.e - sea) / (1 - sea);
  if (h > 0.55) return 'island_peaks';
  return s.m > 0.5 ? 'island_forest' : 'island_plains';
}
function cJungle(s, sea) {
  if (s.e < sea) return 'shallow_sea';
  const h = (s.e - sea) / (1 - sea);
  if (h > 0.6) return 'mountains';
  if (s.m > 0.68 && h < 0.14) return 'swamp';
  if (s.m > 0.36) return 'jungle';
  return 'plains';
}
function cDesert(s, sea, f) {
  if (s.t < 0.06 + 0.2 * f.polarCapBias) return 'polar_frost';
  if (s.e > 0.72) return 'mesa';
  if (s.e < 0.3 && s.m > 0.5) return 'salt_flat';
  if (s.m < 0.3) return 'scorched_rock';
  return 'dune_sea';
}
function cIce(s) {
  if (s.a > 0.74) return 'rift';
  if (s.e > 0.74) return s.m > 0.55 ? 'cryo_volcano' : 'fractured_ridge';
  if (s.m > 0.9 && s.t > 0.35) return 'exposed_rock';
  if (s.m > 0.62) return 'old_ice';
  if (s.m < 0.36) return 'smooth_plain';
  return 'ice_plain';
}
function cVolcanic(s) {
  if (s.a < 0.36) return 'caldera';
  if (s.m > 0.6) return 'lava_field';
  if (s.e > 0.7) return 'basalt_ridge';
  if (s.m > 0.28) return 'ash_plain';
  return 'scorched_rock';
}
function cHothouse(s) {
  if (s.a > 0.7) return 'sulphur_volcano';
  if (s.e > 0.72) return 'corroded_highlands';
  if (s.e < 0.34) return 'dust_basin';
  return 'acid_flats';
}
function cCryoHaze(s, sea) {
  if (s.e < sea) return 'methane_lake';
  if (s.e > 0.74) return 'cryo_highlands';
  if (s.t > 0.75 && s.m < 0.55) return 'hydrocarbon_dunes';
  if (s.m > 0.7) return 'water_ice_bedrock';
  return 'haze_plain';
}
function cHazyMoon(s, sea) {
  if (s.e < sea) return 'methane_lake';
  if (s.t > 0.75 && s.m < 0.55) return 'hydrocarbon_dunes';
  if (s.m > 0.68 || s.e > 0.74) return 'water_ice_bedrock';
  return 'haze_plain';
}
function cScorched(s) {
  if (s.a < 0.37) return 'crater_floor';
  if (s.m > 0.6 || s.a > 0.66) return 'lobate_scarp';
  if (s.e < 0.36) return 'glassy_basin';
  return 'sunbaked_plain';
}
function cBarren(s, sea, f) {
  if (s.a < 0.37) return s.t < 0.06 + 0.2 * f.polarCapBias ? 'polar_crater_ice' : 'crater_floor';
  if (s.a > 0.65) return 'crater_rim';
  return 'regolith_plain';
}
function cTidal(s) {
  if (s.t > 0.93) return 'substellar_rock';
  if (s.t > 0.6) return 'day_side_scorched';
  if (s.t > 0.4) return s.m > 0.72 ? 'terminator_sea' : 'terminator_band';
  return 'night_ice';
}
function cLuna(s, sea, f) {
  if (s.a > 0.65) return 'crater_rim';
  if (s.a < 0.37) return s.t < 0.06 + 0.2 * f.polarCapBias ? 'polar_crater_ice' : 'crater_floor';
  return s.m > 0.5 ? 'maria' : 'highlands';
}
function cIo(s) {
  if (s.a > 0.82) return 'lava_lake';
  if (s.a > 0.62) return 'patera';
  if (s.e > 0.72) return 'silicate_mountains';
  return 'sulphur_plain';
}
function cEuropa(s) {
  if (s.m > 0.5) return 'lineae';
  if (s.e > 0.66) return 'chaos_terrain';
  if (s.e > 0.56) return 'ridged_plain';
  return 'ice_plain';
}
function cCallisto(s) {
  if (s.a > 0.65) return 'crater_rim';
  if (s.a < 0.37) return 'crater_floor';
  if (s.m > 0.68) return 'exposed_rock';
  return 'ice_plain';
}
function cPlanetoid(s) {
  if (s.a > 0.64) return 'crater_rim';
  if (s.a < 0.38) return 'crater_floor';
  if (s.m > 0.5) return 'metal_vein';
  if (s.e > 0.62) return 'solid_rock';
  return 'regolith';
}
function cPlanetoidIcy(s) {
  if (s.a > 0.64) return 'crater_rim';
  if (s.a < 0.38) return 'crater_floor';
  if (s.m > 0.62) return 'dirty_ice';
  return 'frost_regolith';
}
function cGas(s) {
  if (s.e > 0.62) return 'high_deck';
  if (s.e > 0.5) return 'mid_deck';
  if (s.e > 0.38) return 'low_deck';
  return 'dock_ring';
}

const CLASSIFIERS = Object.freeze({
  terran: cTerran, ocean: cOcean, jungle: cJungle, desert: cDesert, ice: cIce, volcanic: cVolcanic,
  hothouse: cHothouse, cryo_haze: cCryoHaze, hazy_moon: cHazyMoon, scorched: cScorched, barren: cBarren,
  tidally_locked: cTidal, rocky_cratered: cLuna, volcanic_moon: cIo, icy_cracked: cEuropa, icy_cratered: cCallisto,
  planetoid: cPlanetoid, planetoid_icy: cPlanetoidIcy, gas: cGas,
});

// ── Parametry pola (field archetypu + domyślne) ─────────────────────────────────────────────────────────────────
const FIELD_DEFAULTS = Object.freeze({
  recipe: null, octaves: 5, warp: 0.2, ridge: 0.4, craterDensity: 0, seaFromWaterCoverage: false, polarCapBias: 0,
  seaShare: 0, freq: 1.4, relief: 0.25, continent: 0, craterScale: 1, craterDepth: 0.1, tropic: 0, wetBias: 0, islands: 0,
  lava: 0, calderas: 0, volcanoes: 0, polarLow: 0, maria: 0, scarps: 0, veins: 0, patches: 0, cracks: 0, paterae: 0,
  basinChance: 0, regional: 0, lavaPlains: 0, rifts: 0, oldIce: 0, regionalDepth: 0.8, highlandBoost: 0,
});
const TERRAN_DEFAULT_WATER = 0.7;   // terran bez zapisanego waterCoverage (nie powinno się zdarzyć po CS-3b `??=`)
const SALTS = Object.freeze([0x1f123bb5, 0x5f356495, 0x2c1b3c6d, 0x297a2d39, 0x6c8e9cf5]);

function recipeOf(arch) {
  const r = arch?.field?.recipe ?? arch?.id ?? null;
  if (r && RECIPES[r]) return r;
  return arch?.family === 'gas' ? 'gas' : 'barren';
}

function paramsKey(seed, arch, params) {
  return `${seed >>> 0}|${arch?.id ?? '?'}|${params?.waterCoverage ?? ''}|${params?.palette ?? params?.planetoidType ?? ''}`;
}

const CTX_CACHE = new Map();
const CTX_CACHE_MAX = 48;

/**
 * Kontekst powierzchni: permutacje, przesunięcia, zmienność z ziarna, poziom morza. Bufor LRU (≤ 48).
 * @param {number} seed surfaceSeed (uint32)
 * @param {object} arch wiersz BODY_ARCHETYPES (id, family, field, biomes)
 * @param {object} [params] parametry ciała (`waterCoverage`, `palette` / `planetoidType`) — może to być samo ciało
 */
export function prepareSurface(seed, arch, params = null) {
  const key = paramsKey(seed, arch, params);
  const hit = CTX_CACHE.get(key);
  if (hit) { CTX_CACHE.delete(key); CTX_CACHE.set(key, hit); return hit; }
  const s = seed >>> 0;
  const f = { ...FIELD_DEFAULTS, ...(arch?.field ?? {}) };
  const recipe = recipeOf(arch);
  const palette = params?.palette ?? params?.planetoidType ?? null;
  const o = new Float64Array(9);
  for (let i = 0; i < 9; i++) o[i] = (unitOf(s, 0x3c6ef372 + i * 0x9e3779b9) - 0.5) * 200;
  const v = {
    freq: 0.85 + 0.35 * unitOf(s, 0x0b4f1d27),
    warp: 0.8 + 0.4 * unitOf(s, 0x7a3c5e91),
    craterFreq: 0.85 + 0.3 * unitOf(s, 0x51ed270b),
    craterMul: 1, albedo: 1, veinMul: 1,
    regBias: (unitOf(s, 0x4b7a3c19) - 0.5) * 0.3,          // udział starych wyżyn ±
    regionFreq: 0.6 + 0.7 * unitOf(s, 0x1d8e4e27),         // lód: skala regionów
    riftMul: 0.5 + 1.0 * unitOf(s, 0x6c62272e),            // lód: siła ryftów
    relief: unitOf(s, 0x5851f42d),                         // rodzina terran (v3): 0 = płaski, 1 = górzysty (ELEVATION_NORM.hiSpread)
    iceBias: (unitOf(s, 0x4f1bbcdc) - 0.5) * 0.3,          // lód (v3): udział starego lodu vs gładkich równin
    iceRidge: 0.45 + 1.1 * unitOf(s, 0x27d4eb2f),          // lód (v3): siła grzbietów
    iceRidgeFreq: 2.0 + 2.4 * unitOf(s, 0x165667b1),       // lód (v3): skala grzbietów
    lavaFreq: 0.7 + 0.7 * unitOf(s, 0x3b9aca07),           // volcanic: gęstość sieci lawy
    lavaMul: 0.75 + 0.55 * unitOf(s, 0x5bd1e995),
    lavaBasin: 0.3 + 0.2 * unitOf(s, 0x2f6b4c33),          // volcanic: zalane niziny
    tTilt: (unitOf(s, 0x7f4a7c15) - 0.5) * 1.0, tTiltLen: 1, tLat: (unitOf(s, 0x2545f4b1) - 0.5) * 0.8,   // tidally_locked: kształt / wydłużenie oka
    tShift: (unitOf(s, 0x0e3779b9) - 0.5) * 0.8,           // tidally_locked: rozmiar strony dziennej
    tSlope: 0.55 + 1.15 * unitOf(s, 0x61c88647),            // tidally_locked: szerokość pasów (terminatora)
    tWobble: 0.25 + 0.4 * unitOf(s, 0x1b873593),           // tidally_locked: nieregularność granic
    tWater: unitOf(s, 0x68e31da4) < 0.5,                   // tidally_locked: woda w terminatorze
    giant: false, gx: 0, gy: 1, gz: 0, gr: 0.4,
  };
  if (arch?.family === 'planetoid') {
    // Zmienność planetoid (BodyArchetypes, CS-3b-v2): kratery ×0.6–1.4, albedo ×0.8–1.2, wielki krater ≈ 1 na 6.
    v.craterMul = 0.6 + 0.8 * unitOf(s, 0x2545f491);
    v.albedo = 0.8 + 0.4 * unitOf(s, 0x6a09e667);
    v.giant = mix32(s ^ 0x3243f6a8) % 6 === 0;
    v.gr = 0.3 + 0.2 * unitOf(s, 0x13198a2e);
    v.veinMul = palette === 'metallic' ? 1.15 : (palette === 'silicate' ? 0.6 : 0.45);
  } else if (f.basinChance > 0) {
    v.giant = unitOf(s, 0x3243f6a8) < f.basinChance;
    v.gr = 0.35 + 0.25 * unitOf(s, 0x13198a2e);
  }
  v.tTiltLen = Math.sqrt(1 + v.tTilt * v.tTilt + v.tLat * v.tLat);
  if (v.giant) {
    // Kierunek z ziarna: odrzucanie w sześcianie (deterministyczne, 0 trygonometrii); awaryjnie biegun.
    for (let k = 0; k < 16; k++) {
      const a = unitOf(s, 0xa4093822 + k * 3) * 2 - 1, b = unitOf(s, 0x299f31d0 + k * 3) * 2 - 1, d = unitOf(s, 0x082efa98 + k * 3) * 2 - 1;
      const l2 = a * a + b * b + d * d;
      if (l2 > 0.04 && l2 <= 1) { const l = Math.sqrt(l2); v.gx = a / l; v.gy = b / l; v.gz = d / l; break; }
    }
  }
  const c = {
    seed: s, arch, f, recipe, palette, o, v,
    freq: f.freq * v.freq,
    n0: makePerm(s ^ 0x9e3779b9), n1: makePerm(s ^ 0x85ebca6b), n2: makePerm(s ^ 0xc2b2ae35),
    salt: SALTS.map(x => (mix32(s ^ x) | 0)),
    sea: 0.5, seaShare: 0, hasSea: false,
    eA: 0, eB: 1,   // normalizacja e (rodzina terran, v3); tożsamość dla pozostałych przepisów
  };
  let share = 0;
  if (f.seaFromWaterCoverage) share = Number.isFinite(params?.waterCoverage) ? params.waterCoverage : TERRAN_DEFAULT_WATER;
  else if (f.seaShare > 0) share = f.seaShare;
  if (share > 0) { c.sea = calibrateSea(c, share, RECIPES[recipe] === rTerran); c.seaShare = share; c.hasSea = true; }
  else c.sea = -1;   // brak morza: e < sea nigdy
  CTX_CACHE.set(key, c);
  if (CTX_CACHE.size > CTX_CACHE_MAX) CTX_CACHE.delete(CTX_CACHE.keys().next().value);
  return c;
}

/**
 * Punkty Fibonacciego na sferze (równopolowe) — WYŁĄCZNIE arytmetyka: obrót o złoty kąt mnożeniem zespolonym
 * przez stałe literały, renormalizacja sqrt w każdym kroku. Wynik Float64Array [x0,y0,z0, x1,…].
 */
export function fibonacciSphere(n) {
  const out = new Float64Array(n * 3);
  let cx = 1, sx = 0;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    out[i * 3] = cx * r; out[i * 3 + 1] = y; out[i * 3 + 2] = sx * r;
    const nc = cx * GOLDEN_COS - sx * GOLDEN_SIN, ns = cx * GOLDEN_SIN + sx * GOLDEN_COS;
    const l = Math.sqrt(nc * nc + ns * ns);
    cx = nc / l; sx = ns / l;
  }
  return out;
}

let FIB_CAL = null;
const S = new Float64Array(4);

// Poziom morza = kwantyl e na stałym zbiorze punktów (udział morza = share). e nie zależy od c.sea.
// normalise (rodzina terran, v3 / Finding 771): ta sama próba SUROWEGO e (bez obcięcia) wyznacza najpierw
// odwzorowanie afiniczne c.eA / c.eB (ELEVATION_NORM), a poziom morza jest kwantylem już znormalizowanego e.
function calibrateSea(c, share, normalise) {
  if (!FIB_CAL) FIB_CAL = fibonacciSphere(SEA_CALIBRATION_POINTS);
  const n = SEA_CALIBRATION_POINTS;
  const es = new Float64Array(n);
  const k = Math.min(n - 1, Math.max(1, Math.floor(share * n + 0.5)));
  if (normalise) {
    const fn = RECIPES[c.recipe];
    for (let i = 0; i < n; i++) { fn(c, FIB_CAL[i * 3], FIB_CAL[i * 3 + 1], FIB_CAL[i * 3 + 2], S); es[i] = S[0]; }
    es.sort();
    const N = ELEVATION_NORM;
    const lo = es[Math.floor(N.qLo * (n - 1))], hi = es[Math.floor(N.qHi * (n - 1))];
    const top = N.hi + (c.v.relief - 0.5) * N.hiSpread;   // rzeźba z ziarna: świat płaski … górzysty
    if (hi - lo > 1e-9) { c.eB = (top - N.lo) / (hi - lo); c.eA = N.lo - lo * c.eB; }
    return clamp01(c.eA + c.eB * (es[k - 1] + es[k]) * 0.5);
  }
  for (let i = 0; i < n; i++) { sampleInto(c, FIB_CAL[i * 3], FIB_CAL[i * 3 + 1], FIB_CAL[i * 3 + 2], S); es[i] = S[0]; }
  es.sort();
  return (es[k - 1] + es[k]) * 0.5;
}

// Rdzeń: próbka do bufora (bez alokacji) — wspólny dla evalAt, kalibracji i bake'u.
function sampleInto(c, x, y, z, out) {
  RECIPES[c.recipe](c, x, y, z, out);
  out[0] = clamp01(out[0]); out[1] = clamp01(out[1]); out[2] = clamp01(out[2]); out[3] = clamp01(out[3]);
}

/**
 * Próbka pola w punkcie sfery — ścieżka ROZGRYWKI (D-CS-16): tylko + − × ÷ sqrt floor. Wektor jest normalizowany.
 * @returns {{e:number, m:number, t:number, a:number}} kanały w [0, 1]
 */
export function evalAt(seed, arch, params, x, y, z) {
  const c = prepareSurface(seed, arch, params);
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 0) { x /= l; y /= l; z /= l; } else { x = 0; y = 1; z = 0; }
  const out = new Float64Array(4);
  sampleInto(c, x, y, z, out);
  return { e: out[0], m: out[1], t: out[2], a: out[3] };
}

/** Poziom morza ciała (−1 = brak morza). */
export function seaLevelOf(seed, arch, params) { return prepareSurface(seed, arch, params).sea; }

/** Metadane powierzchni: poziom i udział morza, przepis, zmienność z ziarna (albedo planetoid → CS-6). */
export function surfaceInfo(seed, arch, params) {
  const c = prepareSurface(seed, arch, params);
  const v = c.v;
  return {
    version: SURFACE_FIELD_VERSION, recipe: c.recipe, seaLevel: c.sea, seaShare: c.seaShare, hasSea: c.hasSea,
    palette: c.palette,
    variation: { freq: v.freq, warp: v.warp, craterMul: v.craterMul, albedo: v.albedo, giantCrater: v.giant, giantRadius: v.giant ? v.gr : 0,
      relief: v.relief,
      // Punkt podgwiezdny przepisu tidally_locked (środek „oka") w przestrzeni pola — CS-6b obraca nim ciało ku gwieździe.
      substellar: [1 / v.tTiltLen, v.tLat / v.tTiltLen, v.tTilt / v.tTiltLen] },
  };
}

const TERRAIN_SET = new Set(GAMEPLAY_TERRAINS);
const BIOME_MAPS = new WeakMap();
const FIELD_MAPS = new WeakMap();

function fieldOf(arch) {
  let f = FIELD_MAPS.get(arch);
  if (!f) { f = Object.freeze({ ...FIELD_DEFAULTS, ...(arch.field ?? {}) }); FIELD_MAPS.set(arch, f); }
  return f;
}

function biomeMap(arch) {
  let m = BIOME_MAPS.get(arch);
  if (!m) {
    m = new Map();
    for (const b of (Array.isArray(arch.biomes) ? arch.biomes : [])) {
      if (b && typeof b.class === 'string') m.set(b.class, TERRAIN_SET.has(b.terrain) ? b.terrain : 'wasteland');
    }
    BIOME_MAPS.set(arch, m);
  }
  return m;
}

/**
 * Próbka → {biome, terrain}: klasa biomu z tabeli wiersza archetypu, teren = jeden z 10 (D-CS-3). Funkcja TOTALNA:
 * nieznany przepis / klasa spoza tabeli / brak wiersza → pierwsza klasa wiersza albo 'wasteland'.
 */
export function classify(sample, arch, seaLevel) {
  if (!arch || typeof arch !== 'object') return { biome: 'unknown', terrain: 'wasteland' };
  const map = biomeMap(arch);
  const fn = CLASSIFIERS[recipeOf(arch)];
  const f = fieldOf(arch);
  const s = sample ?? {};
  const sea = Number.isFinite(seaLevel) ? seaLevel : -1;
  const biome = fn ? fn(s, sea, f) : null;
  if (biome && map.has(biome)) return { biome, terrain: map.get(biome) };
  const first = map.keys().next();
  if (!first.done) return { biome: first.value, terrain: map.get(first.value) };
  return { biome: 'unknown', terrain: 'wasteland' };
}

/**
 * Tekstura equirect RGBA8 (kanały e, m, t, a) — ścieżka WIZUALNA: trygonometria tylko do wektora piksela.
 * @returns {Uint8Array} w·h·4 bajtów
 */
export function bakeEquirect(seed, arch, params, w, h) {
  const c = prepareSurface(seed, arch, params);
  const W2 = w | 0, H2 = h | 0;
  const px = new Uint8Array(W2 * H2 * 4);
  const cosLon = new Float64Array(W2), sinLon = new Float64Array(W2);
  for (let i = 0; i < W2; i++) { const lon = ((i + 0.5) / W2) * 2 * Math.PI - Math.PI; cosLon[i] = Math.cos(lon); sinLon[i] = Math.sin(lon); }
  const out = new Float64Array(4);
  let k = 0;
  for (let j = 0; j < H2; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / H2) * Math.PI;
    const sl = Math.sin(lat), cl = Math.cos(lat);
    for (let i = 0; i < W2; i++) {
      sampleInto(c, cosLon[i] * cl, sl, sinLon[i] * cl, out);
      px[k] = (out[0] * 255 + 0.5) | 0; px[k + 1] = (out[1] * 255 + 0.5) | 0;
      px[k + 2] = (out[2] * 255 + 0.5) | 0; px[k + 3] = (out[3] * 255 + 0.5) | 0;
      k += 4;
    }
  }
  return px;
}
