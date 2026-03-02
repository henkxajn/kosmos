/**
 * terrain.js — główny pipeline generacji heightmap
 *
 * Łączy noise + craters + erosion w spójny heightmap:
 * 1. Base terrain (fBm)           6. Craters (physics-based)
 * 2. Continental plates            7. Micro detail (high-freq fBm)
 * 3. Ridge mountains               8. Hydraulic erosion
 * 4. Tectonic cracks               9. Thermal erosion
 * 5. Domain warping               10. Normalize [0,1]
 */
'use strict';

const { createNoise, fbm3d, ridgedFbm3d, turbulence3d, domainWarp3d, sphereWorley } = require('./noise');
const { generateCraters, applyCraters } = require('./craters');
const { applyErosion } = require('./erosion');
const { sphereCoords, progressBar, progressDone } = require('./utils');

// ── Quality presets ──

const QUALITY = {
  low:    { octaves: 6,  microOct: 2,  worley: false, erosion: 'off',   detailScale: 20 },
  medium: { octaves: 8,  microOct: 3,  worley: true,  erosion: 'light', detailScale: 25 },
  high:   { octaves: 10, microOct: 4,  worley: true,  erosion: 'full',  detailScale: 30 },
  ultra:  { octaves: 12, microOct: 5,  worley: true,  erosion: 'ultra', detailScale: 40 },
};

/**
 * Generuje heightmap planety.
 *
 * @param {number} W — szerokość (piksele)
 * @param {number} H — wysokość
 * @param {object} features — parametry terenu z PLANET_TYPES
 * @param {number} seed
 * @param {string} quality — 'low'|'medium'|'high'|'ultra'
 * @param {boolean} [showProgress=true]
 * @returns {{ heightmap: Float32Array, craters: Array, worleyData: Float32Array|null }}
 */
function generateTerrain(W, H, features, seed, quality = 'high', showProgress = true) {
  const q = QUALITY[quality] || QUALITY.high;
  const t0 = Date.now();

  // ── Tworzenie instancji szumu ──
  const n1 = createNoise(seed);
  const n2 = createNoise(seed + 1000);
  const n3 = createNoise(seed + 2000);
  const n4 = createNoise(seed + 3000);
  const n5 = createNoise(seed + 4000);
  const nDetail = createNoise(seed + 5000);

  const heightmap = new Float32Array(W * H);
  // Worley data do color jitter i mineral streaks
  const worleyData = q.worley ? new Float32Array(W * H * 3) : null; // f1, f2, cellId

  const bs = features.baseScale || 3;

  // ── Faza 1–5: Teren bazowy ──
  const label = 'terrain';
  for (let py = 0; py < H; py++) {
    if (showProgress && py % 50 === 0) progressBar(py, H, label, t0);

    for (let px = 0; px < W; px++) {
      const u = px / W, v = py / H;
      const { x: nx, y: ny, z: nz } = sphereCoords(u, v);

      // 1. Base terrain (fBm na sferze)
      let h = (fbm3d(n1, nx * bs, ny * bs, nz * bs, q.octaves) + 1) * 0.5;

      // 2. Continental plates (low-freq)
      const cont = fbm3d(n5, nx * 1.2, ny * 1.2, nz * 1.2, 4);
      h = h * 0.82 + (cont + 1) * 0.09;

      // 3. Ridge mountains
      if (features.ridges) {
        const rs = features.ridgeScale || 4;
        const ridge = ridgedFbm3d(n2, nx * rs, ny * rs, nz * rs, Math.min(q.octaves, 8));
        const mask = Math.max(0, fbm3d(n3, nx * 1.5, ny * 1.5, nz * 1.5, 4) * 0.5 + 0.5);
        h = h * (1 - mask * features.ridgeBlend) + ridge * mask * features.ridgeBlend;
      }

      // 4. Tectonic cracks
      if (features.tectonic) {
        const ts = features.tecScale || 6;
        const tec = turbulence3d(n3, nx * ts, ny * ts, nz * ts, 4, 2.5, 0.45);

        let tecMask = Math.max(0, fbm3d(n5, nx * 2, ny * 2, nz * 2, 3) * 0.5 + 0.3);

        // Worley edge → cracks tektoniczne
        if (q.worley) {
          const theta = u * Math.PI * 2, phi = v * Math.PI;
          const wor = sphereWorley(theta, phi, ts * 0.7, 0.9, seed + 7000);
          const edge = wor.f2 - wor.f1;
          tecMask *= (1 + (1 - Math.min(edge * 5, 1)) * 0.5);
        }

        h -= tec * tecMask * (features.tecStr || 0.4) * 0.3;
      }

      // 5. Domain warping
      const warp = domainWarp3d(n4, nx * 2, ny * 2, nz * 2, 0.8, 4);
      h = h * 0.7 + (warp + 1) * 0.15;

      // 7. Micro detail (high-freq fBm)
      h += fbm3d(nDetail, nx * q.detailScale, ny * q.detailScale, nz * q.detailScale, q.microOct) * 0.025;
      if (q.microOct >= 4) {
        h += fbm3d(n1, nx * q.detailScale * 2, ny * q.detailScale * 2, nz * q.detailScale * 2, 2) * 0.01;
      }

      heightmap[py * W + px] = h;

      // Worley cache (do kolorów)
      if (q.worley) {
        const theta = u * Math.PI * 2, phi = v * Math.PI;
        const wor = sphereWorley(theta, phi, 6, 0.9, seed + 8000);
        const idx3 = (py * W + px) * 3;
        worleyData[idx3] = wor.f1;
        worleyData[idx3 + 1] = wor.f2;
        worleyData[idx3 + 2] = wor.cellId;
      }
    }
  }
  if (showProgress) progressDone('terrain base', t0);

  // ── Faza 6: Kratery ──
  const craters = generateCraters(features, seed);
  if (craters.length > 0) {
    const t1 = Date.now();
    if (showProgress) process.stdout.write(`  ... craters (${craters.length})\n`);
    applyCraters(heightmap, W, H, craters, { noise3d: nDetail, seed });
    if (showProgress) progressDone(`craters (${craters.length})`, t1);
  }

  // ── Faza 8–9: Erozja ──
  if (q.erosion !== 'off') {
    const t2 = Date.now();
    if (showProgress) process.stdout.write(`  ... erosion (${q.erosion})\n`);
    applyErosion(heightmap, W, H, q.erosion, seed + 6000);
    if (showProgress) progressDone(`erosion (${q.erosion})`, t2);
  }

  // ── Faza 10: Normalizacja [0, 1] ──
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < heightmap.length; i++) {
    if (heightmap[i] < hMin) hMin = heightmap[i];
    if (heightmap[i] > hMax) hMax = heightmap[i];
  }
  const hRange = hMax - hMin || 1;
  for (let i = 0; i < heightmap.length; i++) {
    heightmap[i] = (heightmap[i] - hMin) / hRange;
  }

  return { heightmap, craters, worleyData };
}

module.exports = { generateTerrain, QUALITY };
