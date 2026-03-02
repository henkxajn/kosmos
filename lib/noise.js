/**
 * noise.js — silnik szumu: SimplexNoise3D, Worley, fBm i warianty
 *
 * Używa `simplex-noise` z npm (graceful degradation do wbudowanej implementacji).
 * Szum 3D na sferze → brak szwu gwarantowany.
 */
'use strict';

const { seededRandom } = require('./utils');

// ── Import simplex-noise (z fallback) ──

let _createNoise3D;
try {
  const mod = require('simplex-noise');
  _createNoise3D = mod.createNoise3D;
} catch {
  _createNoise3D = null;
}

// ── Wbudowany SimplexNoise3D (fallback) ──

/**
 * Minimalna implementacja 3D simplex noise.
 * Używana tylko gdy pakiet simplex-noise niedostępny.
 */
class SimplexNoise3DFallback {
  constructor(rng) {
    // permutacja
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise(x, y, z) {
    // 3D simplex noise (Gustavson/Stegu)
    const F3 = 1 / 3, G3 = 1 / 6;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
      else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
      else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
      else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
    }

    const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
    const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;

    const ii=i&255, jj=j&255, kk=k&255;
    const p = this.perm, pm = this.permMod12;

    // gradienty 3D
    const grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
    ];

    const dot3 = (gi, a, b, c) => {
      const g = grad3[gi];
      return g[0]*a + g[1]*b + g[2]*c;
    };

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot3(pm[ii+p[jj+p[kk]]], x0, y0, z0); }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot3(pm[ii+i1+p[jj+j1+p[kk+k1]]], x1, y1, z1); }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot3(pm[ii+i2+p[jj+j2+p[kk+k2]]], x2, y2, z2); }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * dot3(pm[ii+1+p[jj+1+p[kk+1]]], x3, y3, z3); }

    return 32 * (n0 + n1 + n2 + n3); // zakres ~[-1, 1]
  }
}

// ── Fabryka noise3D ──

/**
 * Tworzy funkcję noise3d(x, y, z) → [-1, 1] z podanym seedem.
 */
function createNoise(seed) {
  const rng = seededRandom(seed);
  if (_createNoise3D) {
    return _createNoise3D(rng);
  }
  // fallback
  const snf = new SimplexNoise3DFallback(rng);
  return (x, y, z) => snf.noise(x, y, z);
}

// ── Szum na sferze ──

/**
 * Szum 3D w punkcie sfery (theta, phi) — brak szwu.
 * @param {Function} noise3d
 * @param {number} theta — kąt azymutalny [0, 2π]
 * @param {number} phi   — kąt polarny [0, π]
 * @param {number} scale — skala szumu
 */
function sphereNoise(noise3d, theta, phi, scale) {
  const sinPhi = Math.sin(phi);
  return noise3d(
    Math.cos(theta) * sinPhi * scale,
    Math.cos(phi) * scale,
    Math.sin(theta) * sinPhi * scale,
  );
}

// ── fBm i warianty ──

/**
 * Fractional Brownian Motion na 3D.
 * @param {Function} noise3d
 * @param {number} x, y, z — współrzędne
 * @param {number} octaves — liczba oktaw (6–12+)
 * @param {number} lacunarity — mnożnik częstotliwości per oktawa (domyślnie 2.0)
 * @param {number} gain — mnożnik amplitudy per oktawa (domyślnie 0.52)
 * @returns {number} — wartość w zakresie ~[-1, 1]
 */
function fbm3d(noise3d, x, y, z, octaves, lacunarity = 2.0, gain = 0.52) {
  let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3d(x * frequency, y * frequency, z * frequency);
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp;
}

/**
 * Ridged multifractal — ostre grzbiety.
 */
function ridgedFbm3d(noise3d, x, y, z, octaves, lacunarity = 2.0, gain = 0.52) {
  let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
  let prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = noise3d(x * frequency, y * frequency, z * frequency);
    n = 1 - Math.abs(n); // fold
    n = n * n;            // ostrość
    n *= prev;            // kaskada
    prev = n;
    value += amplitude * n;
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp;
}

/**
 * Turbulencja — suma abs (szum fraktalny bez znaku).
 */
function turbulence3d(noise3d, x, y, z, octaves, lacunarity = 2.0, gain = 0.5) {
  let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * Math.abs(noise3d(x * frequency, y * frequency, z * frequency));
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp;
}

/**
 * Domain warping — deformacja domeny.
 * @param {Function} noise3d
 * @param {number} x, y, z — współrzędne
 * @param {number} strength — siła warpingu
 * @param {number} octaves — oktawy szumu warpującego
 */
function domainWarp3d(noise3d, x, y, z, strength, octaves = 4) {
  const wx = fbm3d(noise3d, x, y, z, octaves);
  const wy = fbm3d(noise3d, x + 5.2, y + 1.3, z + 3.7, octaves);
  const wz = fbm3d(noise3d, x + 9.1, y + 4.8, z + 2.6, octaves);
  return fbm3d(noise3d, x + wx * strength, y + wy * strength, z + wz * strength, octaves);
}

// ── Worley Noise (cellular / Voronoi) ──

/**
 * Hash 3D → pseudo-losowy punkt w komórce
 */
function _hash3(ix, iy, iz, seed) {
  let h = ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1103515245;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return h;
}

function _hashFloat(h, offset) {
  const v = ((h + offset * 374761393) * 1103515245 + 12345) & 0x7fffffff;
  return v / 0x7fffffff;
}

/**
 * Worley noise 3D.
 * @param {number} x, y, z — współrzędne
 * @param {number} jitter — losowe przesunięcie punktów (0–1, domyślnie 0.9)
 * @param {number} seed — seed (domyślnie 0)
 * @returns {{ f1: number, f2: number, cellId: number }} — odległości + ID komórki
 */
function worley3d(x, y, z, jitter = 0.9, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;

  let f1 = 999, f2 = 999;
  let cellId = 0;

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const h = _hash3(cx, cy, cz, seed);

        // punkt w komórce (z jitter)
        const px = dx + _hashFloat(h, 1) * jitter;
        const py = dy + _hashFloat(h, 2) * jitter;
        const pz = dz + _hashFloat(h, 3) * jitter;

        const ddx = fx - px, ddy = fy - py, ddz = fz - pz;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);

        if (dist < f1) {
          f2 = f1;
          f1 = dist;
          cellId = h & 0xffff;
        } else if (dist < f2) {
          f2 = dist;
        }
      }
    }
  }

  return { f1, f2, cellId };
}

/**
 * Worley na sferze — konwertuje UV do 3D i liczy szum komórkowy.
 * @param {number} theta — kąt azymutalny [0, 2π]
 * @param {number} phi   — kąt polarny [0, π]
 * @param {number} scale — skala
 * @param {number} jitter
 * @param {number} seed
 */
function sphereWorley(theta, phi, scale, jitter = 0.9, seed = 0) {
  const sinPhi = Math.sin(phi);
  const sx = Math.cos(theta) * sinPhi * scale;
  const sy = Math.cos(phi) * scale;
  const sz = Math.sin(theta) * sinPhi * scale;
  return worley3d(sx, sy, sz, jitter, seed);
}

module.exports = {
  createNoise,
  sphereNoise,
  fbm3d, ridgedFbm3d, turbulence3d, domainWarp3d,
  worley3d, sphereWorley,
};
