// SurfacePreviewLogic — surowy podgląd powierzchni dla właściciela (ARC COLONY SPHERE, krok CS-4a; plan §3.4).
//
// Czysty moduł (bez DOM): bajty bakeEquirect (e, m, t, a) → RGBA podglądu: paleta biomów wg `colorRole` wiersza
// archetypu + proste cieniowanie z wysokości. To NIE jest wygląd gry — prawdziwy shader to CS-6 (SurfaceShader).
// Konsumenci: `src/debug/SurfacePreviewDebug.js` (csSurface / csSurfaceAll) i sonda arkusza kontaktowego
// `src/testing/headless/probe-cs4a-surface.mjs`. Trygonometria wolna (kosmetyka), Math.random zakazany.

import { classify } from './SurfaceField.js';

/** Barwy ról (sRGB 0–255) — placeholder podglądu; CS-6 ma własne palety + warianty klasy gwiazdy. */
export const PREVIEW_ROLE_COLORS = Object.freeze({
  deepSea: [18, 46, 96], shallowSea: [38, 98, 150], ice: [232, 240, 246], blueIce: [176, 206, 228], peak: [236, 236, 232],
  rock: [128, 116, 104], darkRock: [70, 62, 58], tundra: [138, 140, 112], dryGrass: [170, 156, 96], grass: [92, 140, 64],
  forest: [44, 94, 48], swamp: [62, 88, 58], jungle: [30, 104, 44], sand: [206, 140, 84], salt: [226, 212, 188],
  lava: [255, 96, 24], ash: [92, 84, 80], acid: [176, 132, 76], sulphur: [230, 206, 74], sulphurDust: [206, 170, 96],
  methaneLake: [34, 30, 42], tholin: [176, 120, 64], dirtyIce: [160, 158, 154], oldIce: [150, 168, 186], bakedRock: [150, 126, 104],
  glass: [74, 66, 64], smoothIce: [214, 232, 246], rift: [64, 104, 146], regolith: [140, 138, 134], mare: [78, 78, 82], highland: [176, 174, 168], rustLine: [150, 72, 40],
  metal: [196, 182, 140], deck: [120, 120, 130],
});
const FALLBACK = [255, 0, 255];

function hexRgb(hex) {
  const v = parseInt(String(hex).replace('#', ''), 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : null;
}

/**
 * Barwy ról dla konkretnego ciała: planetoidy barwią skałę / regolit paletą wiersza (`palettes[palette]`) i albedo
 * z ziarna (surfaceInfo.variation.albedo).
 */
export function roleColorsFor(arch, info) {
  const colors = { ...PREVIEW_ROLE_COLORS };
  const pal = arch?.palettes?.[info?.palette] ?? (arch?.palettes ? Object.values(arch.palettes)[0] : null);
  if (pal) {
    const base = hexRgb(pal.base), acc = hexRgb(pal.accent);
    if (base) { colors.regolith = base; colors.rock = base.map(c => c * 0.8); colors.darkRock = base.map(c => c * 0.55); }
    if (acc) colors.metal = acc;
  }
  const alb = info?.variation?.albedo ?? 1;
  if (alb !== 1) for (const k of Object.keys(colors)) colors[k] = colors[k].map(c => Math.min(255, c * alb));
  return colors;
}

/**
 * RGBA podglądu z bajtów bake'u. Cieniowanie: gradient wysokości (światło z północnego zachodu, zawinięcie w
 * długości) + lekka modulacja jasności wysokością; morze ciemnieje z głębią.
 * @returns {{ rgba: Uint8ClampedArray, shares: Object<string, number> }} shares = udział pikseli per teren (ważony cos lat)
 */
export function composePreview(bytes, w, h, arch, info) {
  const colors = roleColorsFor(arch, info);
  const roleOf = new Map((arch?.biomes ?? []).map(b => [b.class, b.colorRole]));
  const sea = info?.seaLevel ?? -1;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const shares = {};
  let wsum = 0;
  const sample = { e: 0, m: 0, t: 0, a: 0 };
  const relief = arch?.family === 'planetoid' ? 9 : 6;
  for (let j = 0; j < h; j++) {
    const wLat = Math.cos(((j + 0.5) / h - 0.5) * Math.PI);
    const jn = Math.max(0, j - 1), js = Math.min(h - 1, j + 1);
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      sample.e = bytes[k] / 255; sample.m = bytes[k + 1] / 255; sample.t = bytes[k + 2] / 255; sample.a = bytes[k + 3] / 255;
      const { biome, terrain } = classify(sample, arch, sea);
      shares[terrain] = (shares[terrain] ?? 0) + wLat; wsum += wLat;
      const col = colors[roleOf.get(biome)] ?? FALLBACK;
      const iw = (i + w - 1) % w, ie = (i + 1) % w;
      const gx = (bytes[(j * w + iw) * 4] - bytes[(j * w + ie) * 4]) / 255;
      const gy = (bytes[(jn * w + i) * 4] - bytes[(js * w + i) * 4]) / 255;
      const underSea = sample.e < sea;
      let shade;
      if (underSea) shade = 0.75 + 0.5 * Math.max(0, Math.min(1, 1 - (sea - sample.e) * 4));
      else shade = Math.max(0.4, Math.min(1.25, 1 + (gx + gy) * relief * (w / 512))) * (0.86 + 0.22 * sample.e);
      rgba[k] = col[0] * shade; rgba[k + 1] = col[1] * shade; rgba[k + 2] = col[2] * shade; rgba[k + 3] = 255;
    }
  }
  for (const t of Object.keys(shares)) shares[t] = +(shares[t] / (wsum || 1)).toFixed(4);
  return { rgba, shares };
}
