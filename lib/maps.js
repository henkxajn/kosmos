/**
 * maps.js — dodatkowe mapy tekstur: AO, specular, emission, clouds, night lights
 */
'use strict';

const { clamp, sphereCoords, seededRandom } = require('./utils');
const { createNoise, fbm3d, sphereWorley } = require('./noise');

// ── Normal map ──

/**
 * Generuje normal map z heightmap (Sobel / central differences).
 * @param {Float32Array} heightmap — W×H
 * @param {number} W, H
 * @param {number} strength — siła normalnych (domyślnie 3.0)
 * @returns {Uint8Array} — RGB W×H×3
 */
function generateNormalMap(heightmap, W, H, strength = 3.0) {
  const normal = new Uint8Array(W * H * 3);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const l = heightmap[py * W + ((px - 1 + W) % W)];
      const r = heightmap[py * W + ((px + 1) % W)];
      const u = heightmap[((py - 1 + H) % H) * W + px];
      const d = heightmap[((py + 1) % H) * W + px];

      let ddx = (l - r) * strength;
      let ddy = (u - d) * strength;
      let ddz = 1;
      const len = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      ddx /= len; ddy /= len; ddz /= len;

      const idx = (py * W + px) * 3;
      normal[idx]     = ((ddx * 0.5 + 0.5) * 255) | 0;
      normal[idx + 1] = ((ddy * 0.5 + 0.5) * 255) | 0;
      normal[idx + 2] = ((ddz * 0.5 + 0.5) * 255) | 0;
    }
  }
  return normal;
}

// ── Heightmap → grayscale ──

function generateHeightGrayscale(heightmap, W, H) {
  const hmap = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    hmap[i] = (heightmap[i] * 255) | 0;
  }
  return hmap;
}

// ── Roughness map ──

/**
 * Generuje roughness map.
 * Niskie obszary → gładsze (zużyte), wysokie → chropowate.
 * Świeże kratery → bardziej rough, stare → gładsze.
 */
function generateRoughnessMap(heightmap, W, H, craters = []) {
  const rough = new Uint8Array(W * H);

  // bazowa roughness z heightmap
  for (let i = 0; i < W * H; i++) {
    const h = heightmap[i];
    rough[i] = clamp(Math.round((0.55 + h * 0.4) * 255), 0, 255);
  }

  // kratery: rim = rough, floor świeżych = rough (odsłonięta skała)
  for (const cr of craters) {
    const extent = cr.r * 1.5;
    const yMin = Math.max(0, Math.floor((cr.v - extent) * H));
    const yMax = Math.min(H - 1, Math.ceil((cr.v + extent) * H));

    for (let py = yMin; py <= yMax; py++) {
      const v = py / H;
      const latScale = Math.sin(v * Math.PI);
      if (latScale < 0.01) continue;

      for (let px = 0; px < W; px++) {
        const u = px / W;
        let du = Math.abs(u - cr.u);
        if (du > 0.5) du = 1 - du;
        du /= latScale;
        const dv = v - cr.v;
        const dist = Math.sqrt(du * du + dv * dv);
        const nd = dist / cr.r;

        if (nd > 1.3) continue;

        const freshness = 1 - cr.age; // świeże → więcej roughness
        if (nd >= 0.75 && nd < 1.1) {
          // rim — chropowaty
          rough[py * W + px] = clamp(rough[py * W + px] + Math.round(freshness * 40), 0, 255);
        } else if (nd < 0.75 && freshness > 0.5) {
          // dno świeżego krateru — odsłonięta skała
          rough[py * W + px] = clamp(rough[py * W + px] + Math.round(freshness * 20), 0, 255);
        }
      }
    }
  }

  return rough;
}

// ── Ambient Occlusion ──

/**
 * Screen-space AO na heightmap.
 * @param {Float32Array} heightmap — W×H
 * @param {number} W, H
 * @param {object} opts
 * @returns {Uint8Array} — grayscale W×H (255=brak AO, 0=pełne AO)
 */
function generateAOMap(heightmap, W, H, opts = {}) {
  const { radius = 8, samples = 12, strength = 1.5 } = opts;
  const ao = new Uint8Array(W * H);

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const hCenter = heightmap[py * W + px];
      let occlusion = 0;

      // próbkuj w N kierunkach
      for (let s = 0; s < samples; s++) {
        const angle = (s / samples) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        let maxAngle = 0;
        for (let r = 1; r <= radius; r++) {
          const sx = ((px + Math.round(dx * r)) % W + W) % W;
          const sy = clamp(py + Math.round(dy * r), 0, H - 1);
          const hSample = heightmap[sy * W + sx];
          const elev = (hSample - hCenter) / r;
          if (elev > maxAngle) maxAngle = elev;
        }

        occlusion += Math.atan(maxAngle * strength * 10) / (Math.PI * 0.5);
      }

      occlusion /= samples;
      ao[py * W + px] = clamp(Math.round((1 - occlusion) * 255), 0, 255);
    }
  }

  return ao;
}

// ── Specular / Metalness map ──

/**
 * Generuje specular/metalness map.
 * @param {Float32Array} heightmap
 * @param {number} W, H
 * @param {Array} craters
 * @param {Float32Array|null} worleyData — f1, f2, cellId per piksel (×3)
 */
function generateSpecularMap(heightmap, W, H, craters = [], worleyData = null) {
  const spec = new Uint8Array(W * H);

  for (let i = 0; i < W * H; i++) {
    const h = heightmap[i];
    // bazowy: gładkie niskie, chropowate wyższe
    let metalness = 0.3 + Math.abs(h - 0.5) * 0.2;

    // Worley: mineralne żyły → wysoki metalness
    if (worleyData) {
      const f1 = worleyData[i * 3];
      const f2 = worleyData[i * 3 + 1];
      const edge = f2 - f1;
      if (edge < 0.1) metalness += (1 - edge / 0.1) * 0.3;
    }

    spec[i] = clamp(Math.round(metalness * 255), 0, 255);
  }

  // kratery: świeże → metallic (odsłonięty metal)
  for (const cr of craters) {
    const extent = cr.r * 1.2;
    const yMin = Math.max(0, Math.floor((cr.v - extent) * H));
    const yMax = Math.min(H - 1, Math.ceil((cr.v + extent) * H));

    for (let py = yMin; py <= yMax; py++) {
      const v = py / H;
      const latScale = Math.sin(v * Math.PI);
      if (latScale < 0.01) continue;

      for (let px = 0; px < W; px++) {
        const u = px / W;
        let du = Math.abs(u - cr.u);
        if (du > 0.5) du = 1 - du;
        du /= latScale;
        const dv = v - cr.v;
        const dist = Math.sqrt(du * du + dv * dv);
        const nd = dist / cr.r;
        if (nd > 1.1) continue;

        const freshness = 1 - cr.age;
        if (freshness > 0.3) {
          const boost = freshness * 0.4 * (1 - nd);
          spec[py * W + px] = clamp(spec[py * W + px] + Math.round(boost * 255), 0, 255);
        }
      }
    }
  }

  return spec;
}

// ── Emission map (volcanic / lava-ocean) ──

/**
 * Generuje emission map (glow lawy w niskich obszarach i szczelinach tektonicznych).
 * @param {Float32Array} heightmap
 * @param {number} W, H
 * @param {number} seed
 * @param {object} opts
 * @returns {Uint8Array} — RGB W×H×3
 */
function generateEmissionMap(heightmap, W, H, seed, opts = {}) {
  const { threshold = 0.4, tecScale = 6 } = opts;
  const emission = new Uint8Array(W * H * 3);
  const n1 = createNoise(seed + 9000);

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const u = px / W, v = py / H;
      const h = heightmap[py * W + px];
      const { x: nx, y: ny, z: nz } = sphereCoords(u, v);

      let glow = 0;

      // niskie obszary → lawa
      if (h < threshold) {
        glow = (threshold - h) / threshold;
      }

      // szczeliny tektoniczne (Worley)
      const theta = u * Math.PI * 2, phi = v * Math.PI;
      const wor = sphereWorley(theta, phi, tecScale * 0.7, 0.9, seed + 9500);
      const edge = wor.f2 - wor.f1;
      if (edge < 0.06) {
        glow = Math.max(glow, (1 - edge / 0.06) * 0.8);
      }

      // modulacja szumem
      const nMod = (fbm3d(n1, nx * 8, ny * 8, nz * 8, 4) + 1) * 0.5;
      glow *= nMod * 0.8 + 0.2;

      if (glow > 0.01) {
        const t = clamp(glow, 0, 1);
        const idx = (py * W + px) * 3;
        emission[idx]     = Math.round(255 * t);          // R
        emission[idx + 1] = Math.round((80 + t * 120) * t); // G
        emission[idx + 2] = Math.round(t * 40 * t);        // B
      }
    }
  }

  return emission;
}

// ── Cloud layer ──

/**
 * Generuje warstwę chmur (RGBA — biały na przezroczystym tle).
 * @param {number} W, H
 * @param {number} seed
 * @returns {Uint8Array} — RGBA W×H×4
 */
function generateCloudLayer(W, H, seed) {
  const clouds = new Uint8Array(W * H * 4);
  const n1 = createNoise(seed + 10000);
  const n2 = createNoise(seed + 10500); // wind warp

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const u = px / W, v = py / H;
      const { x: nx, y: ny, z: nz } = sphereCoords(u, v);

      // domain warp (pasma chmur — wiatr w jednym kierunku)
      const warpX = fbm3d(n2, nx * 2, ny * 2, nz * 2, 3) * 1.5;
      const cloudVal = (fbm3d(n1, nx * 4 + warpX, ny * 4, nz * 4, 6) + 1) * 0.5;

      const threshold = 0.45;
      if (cloudVal > threshold) {
        const alpha = clamp((cloudVal - threshold) / (1 - threshold), 0, 1);
        const idx = (py * W + px) * 4;
        clouds[idx]     = 255;
        clouds[idx + 1] = 255;
        clouds[idx + 2] = 255;
        clouds[idx + 3] = Math.round(alpha * 200); // semi-transparent
      }
    }
  }

  return clouds;
}

// ── Night lights ──

/**
 * Generuje mapę świateł nocnych (punkty w niskich obszarach).
 * @param {Float32Array} heightmap
 * @param {number} W, H
 * @param {number} seed
 * @returns {Uint8Array} — grayscale W×H
 */
function generateNightLightsMap(heightmap, W, H, seed) {
  const lights = new Uint8Array(W * H);

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const h = heightmap[py * W + px];
      if (h > 0.45) continue; // tylko niskie obszary (równiny)

      const u = px / W, v = py / H;
      const theta = u * Math.PI * 2, phi = v * Math.PI;
      const wor = sphereWorley(theta, phi, 20, 0.9, seed + 11000);

      // punkty światła: Worley f1 < próg
      if (wor.f1 < 0.08) {
        const brightness = (1 - wor.f1 / 0.08) * (1 - h / 0.45);
        lights[py * W + px] = clamp(Math.round(brightness * 255), 0, 255);
      }
    }
  }

  return lights;
}

module.exports = {
  generateNormalMap,
  generateHeightGrayscale,
  generateRoughnessMap,
  generateAOMap,
  generateSpecularMap,
  generateEmissionMap,
  generateCloudLayer,
  generateNightLightsMap,
};
