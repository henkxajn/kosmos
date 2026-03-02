/**
 * craters.js — fizyczne profile kraterów: multi-ring, ejecta, degradation
 *
 * Kratery sortowane od największych do najmniejszych — naturalny overlapping.
 * Profil bazujący na fizyce uderzeniowej (central peak, floor, rim, ejecta blanket).
 */
'use strict';

const { seededRandom } = require('./utils');

// ── Generowanie listy kraterów ──

/**
 * Generuje listę kraterów dla planety.
 * @param {object} features — parametry z PLANET_TYPES
 * @param {number} seed
 * @returns {Array<object>} — posortowane od największego
 */
function generateCraters(features, seed) {
  if (!features.craters) return [];

  const rng = seededRandom(seed + 9000);
  const cc = features.craterCount || 40;
  const craters = [];

  // 5% giant (multi-ring basins), 15% large, 30% medium, 50% tiny
  const classes = [
    { frac: 0.05, minR: 0.05,  maxR: 0.12, minD: 0.7, maxD: 1.0, rings: 2, ejecta: true,  peak: true  },
    { frac: 0.15, minR: 0.02,  maxR: 0.06, minD: 0.4, maxD: 0.8, rings: 1, ejecta: 0.6,   peak: true  },
    { frac: 0.30, minR: 0.005, maxR: 0.02, minD: 0.2, maxD: 0.5, rings: 0, ejecta: false,  peak: false },
    { frac: 0.50, minR: 0.001, maxR: 0.006,minD: 0.1, maxD: 0.4, rings: 0, ejecta: false,  peak: false },
  ];

  for (const cls of classes) {
    const n = Math.ceil(cc * cls.frac);
    for (let i = 0; i < n; i++) {
      const r = cls.minR + rng() * (cls.maxR - cls.minR);
      // unikanie biegunów (tam kratery wyglądają zniekształcone w equirectangular)
      const yMin = 0.08, yMax = 0.92;
      craters.push({
        u: rng(),                              // pozycja X w UV [0, 1]
        v: yMin + rng() * (yMax - yMin),       // pozycja Y w UV
        r,                                     // promień w UV space
        depth: cls.minD + rng() * (cls.maxD - cls.minD),
        rimHeight: 0.15 + rng() * 0.35,
        rings: cls.rings,
        ejecta: cls.ejecta === true || (typeof cls.ejecta === 'number' && rng() < cls.ejecta),
        peak: cls.peak && r > 0.015,
        age: rng(),                            // 0=świeży, 1=stary (degradation)
        nRays: 5 + Math.floor(rng() * 8),      // ilość promieni ejecta
        phase: rng() * Math.PI * 2,            // faza kątowa
      });
    }
  }

  // sortowanie od największego (overlapping: duże najpierw)
  craters.sort((a, b) => b.r - a.r);
  return craters;
}

// ── Aplikowanie kraterów na heightmap ──

/**
 * Nakłada kratery na heightmap (Float32Array, W×H).
 * @param {Float32Array} heightmap — modyfikowana in-place
 * @param {number} W — szerokość
 * @param {number} H — wysokość
 * @param {Array<object>} craters — z generateCraters()
 * @param {object} [opts]
 * @param {Function} [opts.noise3d] — do modulacji (degradation, ejecta)
 * @param {number}   [opts.seed]    — seed do lokalnego szumu
 */
function applyCraters(heightmap, W, H, craters, opts = {}) {
  const noise3d = opts.noise3d || null;
  const degradeSeed = opts.seed || 12345;
  const rng = seededRandom(degradeSeed + 5555);

  for (const cr of craters) {
    // oblicz bounding box w pikselach
    const extent = cr.r * 2.8; // promień ejecta ≈ 2.5R + margines
    const yMin = Math.max(0, Math.floor((cr.v - extent) * H));
    const yMax = Math.min(H - 1, Math.ceil((cr.v + extent) * H));

    for (let py = yMin; py <= yMax; py++) {
      // korekta odległości zależna od latitude (equirectangular)
      const v = py / H;
      const latScale = Math.sin(v * Math.PI);
      if (latScale < 0.01) continue; // bieguny — pomijaj

      for (let px = 0; px < W; px++) {
        const u = px / W;

        // odległość w UV z wrappingiem X
        let du = Math.abs(u - cr.u);
        if (du > 0.5) du = 1 - du;
        // korekta na latitude (piksele bliżej biegunów są węższe)
        du /= latScale;
        const dv = v - cr.v;
        const dist = Math.sqrt(du * du + dv * dv);

        if (dist > cr.r * 2.8) continue;

        const nd = dist / cr.r; // znormalizowana odległość (0=centrum, 1=rim)
        let delta = 0;

        // degradation — starsze kratery mają rozmyty profil
        const degrade = cr.age * 0.4; // 0=ostry, 0.4=max rozmycie
        const sharpness = 1 - degrade;

        // ── Central peak (wielopierścieniowe, duże kratery) ──
        if (nd < 0.18 && cr.peak) {
          const peakH = cr.depth * 0.08 * sharpness;
          const peakT = 1 - nd / 0.18;
          delta += peakH * peakT * peakT;
        }

        // ── Inner ring (baseny wielopierścieniowe) ──
        if (cr.rings >= 2 && nd >= 0.25 && nd < 0.4) {
          const ringT = (nd - 0.25) / 0.15;
          delta += cr.rimHeight * 0.25 * Math.sin(ringT * Math.PI) * 0.05 * sharpness;
        }

        // ── Floor (dno krateru — paraboliczny profil) ──
        if (nd < 0.80) {
          const floorT = nd / 0.80;
          delta -= cr.depth * (1 - floorT * floorT) * 0.12 * (0.6 + 0.4 * sharpness);
        }

        // ── Rim (wał kraterowy — sinusoidalny profil) ──
        if (nd >= 0.75 && nd < 1.05) {
          const rimT = (nd - 0.75) / 0.30;
          delta += cr.rimHeight * Math.sin(rimT * Math.PI) * 0.08 * (0.5 + 0.5 * sharpness);
        }

        // ── Outer rim (zewnętrzny wał, degraded) ──
        if (cr.rings >= 1 && nd >= 1.0 && nd < 1.35) {
          const outerT = (nd - 1.0) / 0.35;
          delta += cr.rimHeight * 0.2 * Math.sin(outerT * Math.PI) * 0.04 * sharpness;
        }

        // ── Ejecta blanket + rays ──
        if (cr.ejecta && nd >= 0.9 && nd < 2.5) {
          const ejT = 1 - (nd - 0.9) / 1.6; // zanikanie
          if (ejT > 0) {
            const ang = Math.atan2(dv, du);
            // promieniste smugi
            const rayPattern = Math.pow(Math.max(0, Math.cos(ang * cr.nRays + cr.phase)), 4);
            let ejDelta = cr.rimHeight * rayPattern * ejT * 0.025 * sharpness;

            // szum na ejecta (drobne fragmenty)
            if (noise3d) {
              const theta = u * Math.PI * 2, phi = v * Math.PI;
              const sinPhi = Math.sin(phi);
              const nx = Math.cos(theta) * sinPhi, ny = Math.cos(phi), nz = Math.sin(theta) * sinPhi;
              const nej = noise3d(nx * 30, ny * 30, nz * 30);
              ejDelta *= (0.7 + 0.3 * nej);
            }

            delta += ejDelta;
          }
        }

        heightmap[py * W + px] += delta;
      }
    }
  }
}

module.exports = { generateCraters, applyCraters };
