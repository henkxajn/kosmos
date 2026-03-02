/**
 * erosion.js — hydraulic + thermal erosion na heightmap
 *
 * Działa na Float32Array (W×H). Sferyczny wrapping: x wraps (0↔W), y clamp (0, H-1).
 */
'use strict';

const { seededRandom } = require('./utils');

// ── Sferyczny wrapping i interpolacja ──

function wrapX(x, W) { return ((x % W) + W) % W; }
function clampY(y, H) { return y < 0 ? 0 : y >= H ? H - 1 : y; }

/** Bilinearna interpolacja z wrap/clamp */
function sampleBilinear(hmap, W, H, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;

  const x0w = wrapX(x0, W),     x1w = wrapX(x0 + 1, W);
  const y0c = clampY(y0, H),     y1c = clampY(y0 + 1, H);

  const v00 = hmap[y0c * W + x0w];
  const v10 = hmap[y0c * W + x1w];
  const v01 = hmap[y1c * W + x0w];
  const v11 = hmap[y1c * W + x1w];

  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
         v01 * (1 - fx) * fy + v11 * fx * fy;
}

/** Gradient (nachylenie) w punkcie — bilinearna różnica */
function sampleGradient(hmap, W, H, x, y) {
  const eps = 1.0;
  const gx = sampleBilinear(hmap, W, H, x + eps, y) - sampleBilinear(hmap, W, H, x - eps, y);
  const gy = sampleBilinear(hmap, W, H, x, y + eps) - sampleBilinear(hmap, W, H, x, y - eps);
  return { gx, gy };
}

// ── Hydraulic erosion (droplet-based) ──

/**
 * Symulacja erozji wodnej — N kropli spływa po heightmap.
 * @param {Float32Array} hmap — heightmap W×H, modyfikowana in-place
 * @param {number} W, H — wymiary
 * @param {object} params — parametry symulacji
 */
function hydraulicErosion(hmap, W, H, params = {}) {
  const {
    drops = W * H * 0.3,
    lifetime = 80,
    inertia = 0.3,
    capacity = 8,
    deposition = 0.02,
    erosion = 0.5,
    evaporation = 0.02,
    minSlope = 0.01,
    seed = 42,
  } = params;

  const rng = seededRandom(seed);

  for (let d = 0; d < drops; d++) {
    // losowa pozycja startowa
    let x = rng() * W;
    let y = rng() * H;
    let dx = 0, dy = 0;
    let water = 1;
    let sediment = 0;
    let speed = 1;

    for (let step = 0; step < lifetime; step++) {
      const ix = Math.floor(x), iy = Math.floor(y);
      if (iy < 0 || iy >= H) break;

      // gradient
      const grad = sampleGradient(hmap, W, H, x, y);

      // nowy kierunek (z inercją)
      dx = dx * inertia - grad.gx * (1 - inertia);
      dy = dy * inertia - grad.gy * (1 - inertia);

      // normalizacja
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.0001) {
        // losowy kierunek jeśli flat
        const ang = rng() * Math.PI * 2;
        dx = Math.cos(ang);
        dy = Math.sin(ang);
      } else {
        dx /= len;
        dy /= len;
      }

      // nowa pozycja
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= H) break;

      // różnica wysokości
      const hOld = sampleBilinear(hmap, W, H, x, y);
      const hNew = sampleBilinear(hmap, W, H, nx, ny);
      const dh = hNew - hOld;

      // carrying capacity
      const slope = Math.max(-dh, minSlope);
      const cap = Math.max(slope, minSlope) * speed * water * capacity;

      if (sediment > cap || dh > 0) {
        // depozycja
        const amount = (dh > 0)
          ? Math.min(sediment, dh) // wypełnij wzniesienie
          : (sediment - cap) * deposition;

        sediment -= amount;
        // rozprowadź depozyt bilinearnie
        _deposit(hmap, W, H, x, y, amount);
      } else {
        // erozja
        const amount = Math.min((cap - sediment) * erosion, -dh);
        sediment += amount;
        _erode(hmap, W, H, x, y, amount);
      }

      // aktualizacja
      speed = Math.sqrt(Math.max(speed * speed + dh, 0.001));
      water *= (1 - evaporation);
      x = nx;
      y = ny;

      if (water < 0.001) break;
    }
  }
}

/** Depozyt w punkcie (bilinear splat) */
function _deposit(hmap, W, H, x, y, amount) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;

  const weights = [
    (1 - fx) * (1 - fy),
    fx * (1 - fy),
    (1 - fx) * fy,
    fx * fy,
  ];
  const coords = [
    [wrapX(x0, W),     clampY(y0, H)],
    [wrapX(x0 + 1, W), clampY(y0, H)],
    [wrapX(x0, W),     clampY(y0 + 1, H)],
    [wrapX(x0 + 1, W), clampY(y0 + 1, H)],
  ];

  // W potrzebne wewnątrz — closure
  const width = hmap.length / H; // odczyt W z rozmiaru
  for (let i = 0; i < 4; i++) {
    hmap[coords[i][1] * W + coords[i][0]] += amount * weights[i];
  }
}

/** Erozja w punkcie (bilinear splat) */
function _erode(hmap, W, H, x, y, amount) {
  _deposit(hmap, W, H, x, y, -amount);
}

// ── Thermal erosion (iteracyjna) ──

/**
 * Erozja termiczna — materiał z ostrych klifów spada do dolin.
 * @param {Float32Array} hmap — heightmap W×H, modyfikowana in-place
 * @param {number} W, H
 * @param {object} params
 */
function thermalErosion(hmap, W, H, params = {}) {
  const {
    iterations = 100,
    talusAngle = 0.02,
    erosionRate = 0.3,
  } = params;

  // 8 sąsiadów (dx, dy)
  const neighbors = [
    [-1,-1],[ 0,-1],[ 1,-1],
    [-1, 0],        [ 1, 0],
    [-1, 1],[ 0, 1],[ 1, 1],
  ];

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const h = hmap[y * W + x];
        let maxDiff = 0;
        let totalDiff = 0;
        const diffs = [];

        for (const [ddx, ddy] of neighbors) {
          const nx = wrapX(x + ddx, W);
          const ny = clampY(y + ddy, H);
          const nh = hmap[ny * W + nx];
          const diff = h - nh;
          if (diff > talusAngle) {
            diffs.push({ nx, ny, diff });
            totalDiff += diff;
            if (diff > maxDiff) maxDiff = diff;
          }
        }

        if (diffs.length === 0) continue;

        // przesuń materiał proporcjonalnie
        const moveTotal = maxDiff * 0.5 * erosionRate;
        for (const d of diffs) {
          const frac = d.diff / totalDiff;
          const move = moveTotal * frac;
          hmap[y * W + x] -= move;
          hmap[d.ny * W + d.nx] += move;
        }
      }
    }
  }
}

// ── Presets jakości ──

const EROSION_PRESETS = {
  off: null,
  light: {
    hydraulic: { drops: 0.1, lifetime: 50, capacity: 6, erosion: 0.3 },
    thermal: { iterations: 40, talusAngle: 0.025, erosionRate: 0.2 },
  },
  full: {
    hydraulic: { drops: 0.3, lifetime: 80, capacity: 8, erosion: 0.5 },
    thermal: { iterations: 100, talusAngle: 0.02, erosionRate: 0.3 },
  },
  ultra: {
    hydraulic: { drops: 0.5, lifetime: 100, capacity: 10, erosion: 0.6 },
    thermal: { iterations: 200, talusAngle: 0.015, erosionRate: 0.35 },
  },
};

/**
 * Wykonuje pełną erozję wg presetu.
 * @param {Float32Array} hmap
 * @param {number} W, H
 * @param {string} preset — 'off'|'light'|'full'|'ultra'
 * @param {number} seed
 */
function applyErosion(hmap, W, H, preset = 'full', seed = 42) {
  const cfg = EROSION_PRESETS[preset];
  if (!cfg) return;

  // hydraulic
  if (cfg.hydraulic) {
    const drops = Math.round(W * H * cfg.hydraulic.drops);
    hydraulicErosion(hmap, W, H, {
      ...cfg.hydraulic,
      drops,
      seed,
    });
  }

  // thermal
  if (cfg.thermal) {
    thermalErosion(hmap, W, H, cfg.thermal);
  }
}

module.exports = { hydraulicErosion, thermalErosion, applyErosion, EROSION_PRESETS };
