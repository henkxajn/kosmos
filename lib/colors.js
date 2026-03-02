/**
 * colors.js — gradient mapping z gamma, color jitter, biomes, polar ice, lava flows
 */
'use strict';

const { clamp, smoothstep, lerp } = require('./utils');

// ── Gamma-correct color interpolation ──

/**
 * Interpolacja koloru w przestrzeni gamma (linearyzacja → lerp → powrót).
 * @param {Array<[number,number,number]>} colors — paleta gradientowa
 * @param {number} t — pozycja [0, 1]
 * @param {number} gamma — gamma (domyślnie 2.2)
 * @returns {[number,number,number]} — kolor RGB [0–255]
 */
function gammaLerp(colors, t, gamma = 2.2) {
  t = clamp(t, 0, 0.999);
  const idx = t * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = colors[i];
  const b = colors[Math.min(i + 1, colors.length - 1)];

  // linearyzacja → interpolacja → powrót do gamma
  const invG = 1 / gamma;
  const r = Math.pow(lerp(Math.pow(a[0] / 255, gamma), Math.pow(b[0] / 255, gamma), f), invG) * 255;
  const g = Math.pow(lerp(Math.pow(a[1] / 255, gamma), Math.pow(b[1] / 255, gamma), f), invG) * 255;
  const bl = Math.pow(lerp(Math.pow(a[2] / 255, gamma), Math.pow(b[2] / 255, gamma), f), invG) * 255;

  return [r, g, bl];
}

/**
 * Prosta interpolacja liniowa po palecie (bez gamma — szybka).
 */
function multiLerp(colors, t) {
  t = clamp(t, 0, 0.999);
  const idx = t * (colors.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  const a = colors[i];
  const b = colors[Math.min(i + 1, colors.length - 1)];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

/**
 * Kontrast S-curve — wzmacnia kontrast heightmapy.
 * @param {number} t — wartość [0, 1]
 * @param {number} k — siła kontrastu (2–4 typowe)
 */
function contrastCurve(t, k = 2.5) {
  const tk = Math.pow(t, k);
  return tk / (tk + Math.pow(1 - t, k));
}

// ── Color jitter per biome (Worley cellId) ──

/**
 * Zmienia odcień/nasycenie/jasność na podstawie cellId z Worley noise.
 * @param {[number,number,number]} rgb — kolor bazowy
 * @param {number} cellId — z worley3d().cellId
 * @param {number} strength — siła jittera (domyślnie 1.0)
 * @returns {[number,number,number]}
 */
function colorJitter(rgb, cellId, strength = 1.0) {
  // pseudo-losowe przesunięcia z cellId
  const h1 = ((cellId * 73856093) & 0xffff) / 0xffff;
  const h2 = ((cellId * 19349663) & 0xffff) / 0xffff;
  const h3 = ((cellId * 83492791) & 0xffff) / 0xffff;

  const hueShift = (h1 - 0.5) * 30 * strength;  // ±15°
  const satShift = (h2 - 0.5) * 0.2 * strength;  // ±10%
  const valShift = (h3 - 0.5) * 0.16 * strength;  // ±8%

  // RGB → HSV
  const hsv = rgb2hsv(rgb);
  hsv[0] = (hsv[0] + hueShift + 360) % 360;
  hsv[1] = clamp(hsv[1] + satShift, 0, 1);
  hsv[2] = clamp(hsv[2] + valShift, 0, 1);

  return hsv2rgb(hsv);
}

// ── RGB ↔ HSV ──

function rgb2hsv(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max > 0 ? d / max : 0;
  return [h, s, max];
}

function hsv2rgb(hsv) {
  const [h, s, v] = hsv;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r, g, b;
  if (h < 60) { r=c; g=x; b=0; }
  else if (h < 120) { r=x; g=c; b=0; }
  else if (h < 180) { r=0; g=c; b=x; }
  else if (h < 240) { r=0; g=x; b=c; }
  else if (h < 300) { r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// ── Mineral streaks (Worley f2-f1) ──

/**
 * Modyfikuje kolor na podstawie Worley noise (żyły mineralne).
 * @param {[number,number,number]} rgb
 * @param {number} f1, f2 — odległości z Worley
 * @param {number} threshold — próg wykrycia żyły
 * @param {number} strength — siła efektu
 */
function mineralStreaks(rgb, f1, f2, threshold = 0.08, strength = 1.0) {
  const edge = f2 - f1;
  if (edge > threshold) return rgb;

  const t = 1 - edge / threshold;
  const boost = t * strength * 20;
  return [
    clamp(rgb[0] + boost, 0, 255),
    clamp(rgb[1] - boost * 0.3, 0, 255),
    clamp(rgb[2] - boost * 0.5, 0, 255),
  ];
}

// ── Polar ice ──

/**
 * Nakłada lód polarny z linią topnienia modulowaną szumem.
 * @param {[number,number,number]} rgb — kolor bazowy
 * @param {number} absLat — |latitude| w [0, 1]
 * @param {number} noiseVal — szum do modulacji linii topnienia [-1, 1]
 * @param {object} opts
 * @param {number} opts.polarStart — początek lodu (domyślnie 0.7)
 * @param {number} opts.polarEnd   — pełny lód (domyślnie 0.92)
 * @param {boolean} opts.frost     — biały szron (true) czy ciemnienie (false)
 */
function polarIce(rgb, absLat, noiseVal, opts = {}) {
  const { polarStart = 0.7, polarEnd = 0.92, frost = true } = opts;

  // szum moduluje linię topnienia
  const noisedLat = absLat + noiseVal * 0.05;
  const blend = smoothstep(polarStart, polarEnd, noisedLat);

  if (blend <= 0) return rgb;

  if (frost) {
    // biały szron z lekkim odcieniem niebieskim
    const iceR = 225, iceG = 235, iceB = 245;
    return [
      lerp(rgb[0], iceR, blend),
      lerp(rgb[1], iceG, blend),
      lerp(rgb[2], iceB, blend),
    ];
  } else {
    // ciemnienie (bez szronu — np. rocky bez lodu)
    const darkFactor = 1 - blend * 0.2;
    return [rgb[0] * darkFactor, rgb[1] * darkFactor, rgb[2] * darkFactor];
  }
}

// ── Lava flow channels ──

/**
 * Generuje kolor kanałów lawowych (volcanic / lava-ocean).
 * @param {[number,number,number]} rgb — kolor bazowy
 * @param {number} flowValue — wartość kanału (ridged noise + domain warp), [0, 1]
 * @param {number} height — wysokość w punkcie [0, 1]
 * @param {number} threshold — próg aktywacji lawy (niskie obszary)
 */
function lavaFlow(rgb, flowValue, height, threshold = 0.45) {
  if (height > threshold) return rgb;

  // intensywność rośnie z głębokością
  const depthFactor = 1 - height / threshold;
  const lavaT = flowValue * depthFactor;

  if (lavaT < 0.1) return rgb;

  // kolory lawy: od czerwieni do pomarańczu
  const t = clamp((lavaT - 0.1) / 0.9, 0, 1);
  const lavaR = 255;
  const lavaG = 80 + t * 120;
  const lavaB = t * 40;

  return [
    lerp(rgb[0], lavaR, lavaT * 0.8),
    lerp(rgb[1], lavaG, lavaT * 0.8),
    lerp(rgb[2], lavaB, lavaT * 0.8),
  ];
}

// ── Color variation (low-freq noise) ──

/**
 * Subtelna wariacja kolorystyczna oparta na szumie (zamiennik prostego cv).
 */
function colorVariation(rgb, noiseVal, strength = 10) {
  const v = noiseVal * strength;
  return [
    clamp(rgb[0] + v, 0, 255),
    clamp(rgb[1] + v * 0.7, 0, 255),
    clamp(rgb[2] + v * 0.4, 0, 255),
  ];
}

module.exports = {
  gammaLerp, multiLerp, contrastCurve,
  colorJitter, mineralStreaks,
  polarIce, lavaFlow, colorVariation,
  rgb2hsv, hsv2rgb,
};
