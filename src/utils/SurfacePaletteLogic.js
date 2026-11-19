// SurfacePaletteLogic — wygląd powierzchni ciała dla wspólnego shadera (ARC COLONY SPHERE, krok CS-6a; plan §3.6).
//
// Czysty moduł (bez DOM, bez THREE; wykonuje się pod node — keeper `colony_sphere_shader_smoke`).
// `resolveSurfaceLook(body, spectralType)` → paleta 8 barw (liniowe RGB) + parametry shadera, DETERMINISTYCZNIE z danych
// zapisanych w ciele: `surfaceSeed`, `bodyArchetype`, typ planetoidy i klasa gwiazdy. Bez Math.random.
//
// Jak powstaje „żadne dwa ciała nie są takie same":
//   1. wariant A palety archetypu (wagi wariantów zależą od klasy gwiazdy, np. czerwona roślinność przy M),
//   2. domieszka wariantu B (≠ A) z wagą 0…PALETTE_BLEND_MAX — przestrzeń ciągła, nie skończona lista,
//   3. wspólny dla całej palety rozrzut odcienia / nasycenia / jasności / osi ciepło↔chłodno,
//   4. mały niezależny rozrzut każdego slotu,
//   5. odcień klasy gwiazdy na albedo (światło gwiazdy barwi scenę osobno).

import { ARCHETYPE_BY_ID } from '../data/BodyArchetypes.js';
import {
  BODY_PALETTES, SURFACE_LOOKS, SURFACE_PALETTE_SLOTS, SURFACE_EMISSIVE_SLOTS, STAR_CLASS_TINT, STAR_CLASS_TINT_DEFAULT,
  PALETTE_JITTER_DEFAULT, PALETTE_SLOT_JITTER, PALETTE_BLEND_MAX,
} from '../data/BodyPalettes.js';
import { planetoidPaletteOf } from './BodyArchetypeLogic.js';
import { seaLevelOf } from './SurfaceField.js';
import { mixSeed, combineSeeds } from './SeedMath.js';

const KINDS = Object.freeze(['planet', 'moon', 'planetoid']);
const SALT_PALETTE = 0x43533661;   // 'CS6a'

/** Liczba z [0, 1) z ziarna i numeru strumienia (splitmix — jak reszta arca). */
function unit(seed, n) { return mixSeed(combineSeeds(seed >>> 0, SALT_PALETTE, n)) / 4294967296; }

export function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

export function hsvToRgb([h, s, val]) {
  const c = val * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = val - c;
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

const clamp01 = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));
/** sRGB → liniowe (przestrzeń robocza three). */
export function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

/** Warianty palety ciała: planetoidy mają tabelę per typ (`variantsByPalette`). */
export function paletteVariantsOf(body) {
  const row = BODY_PALETTES[body?.bodyArchetype];
  if (!row) return null;
  if (row.variantsByPalette) {
    const key = planetoidPaletteOf(body);
    return row.variantsByPalette[key] ?? Object.values(row.variantsByPalette)[0];
  }
  return row.variants ?? null;
}

/** Losowanie ważone (wagi wariantów × mnożnik klasy gwiazdy); `skip` = indeks wykluczony (wariant A przy wyborze B). */
function pickVariant(variants, u, starClass, skip = -1) {
  let total = 0;
  const w = variants.map((it, i) => { const k = i === skip ? 0 : (it.star?.[starClass] ?? 1); total += k; return k; });
  if (!(total > 0)) return skip === 0 && variants.length > 1 ? 1 : 0;
  let acc = u * total;
  for (let i = 0; i < w.length; i++) { acc -= w[i]; if (acc < 0) return i; }
  return w.length - 1;
}

/** Czy ciało ma wygląd wspólnego shadera (planeta / księżyc / planetoida z ziarnem i archetypem powierzchni, nie gaz). */
export function hasSurfaceLook(body) {
  if (!KINDS.includes(body?.type) || !Number.isFinite(body?.surfaceSeed)) return false;
  const arch = ARCHETYPE_BY_ID[body?.bodyArchetype];
  return !!arch && arch.family !== 'gas' && !!BODY_PALETTES[arch.id] && !!paletteVariantsOf(body);
}

/**
 * Wygląd powierzchni ciała. Zwraca null, gdy ciało nie idzie wspólnym shaderem (gaz, brak ziarna / archetypu).
 * @param {object} body encja Planet / Moon / Planetoid (albo rekord: type, surfaceSeed, bodyArchetype, planetoidType)
 * @param {string} [spectralType] klasa gwiazdy układu ('M' | 'K' | 'G' | 'F')
 * @returns {null | {archetype:string, look:number, lookName:string, variantA:string, variantB:string, blend:number,
 *   colors:Float32Array, placeholder:number[], mode:number, capT:number, mThr:number, eThr:number, eMode:number,
 *   relief:number, specular:number, emissive:number, wrap:number, hasSea:boolean, jitter:object}}
 */
export function resolveSurfaceLook(body, spectralType = 'G') {
  if (!hasSurfaceLook(body)) return null;
  const row = BODY_PALETTES[body.bodyArchetype];
  const variants = paletteVariantsOf(body);
  const seed = body.surfaceSeed >>> 0;
  const star = STAR_CLASS_TINT[spectralType] ? spectralType : 'G';
  const tint = STAR_CLASS_TINT[star] ?? STAR_CLASS_TINT_DEFAULT;

  const ia = pickVariant(variants, unit(seed, 1), star);
  const ib = variants.length > 1 ? pickVariant(variants, unit(seed, 2), star, ia) : ia;
  const blend = variants.length > 1 ? unit(seed, 3) * PALETTE_BLEND_MAX : 0;

  const J = { ...PALETTE_JITTER_DEFAULT, ...(row.jitter ?? {}) };
  const dHue = (unit(seed, 4) * 2 - 1) * J.hue;
  const kSat = 1 + (unit(seed, 5) * 2 - 1) * J.sat;
  const kVal = 1 + (unit(seed, 6) * 2 - 1) * J.val;
  const warm = (unit(seed, 7) * 2 - 1) * J.warm;
  const emissive = SURFACE_EMISSIVE_SLOTS[row.look] ?? [];

  const colors = new Float32Array(SURFACE_PALETTE_SLOTS * 3);
  const a = variants[ia].colors, b = variants[ib].colors;
  let pr = 0, pg = 0, pb = 0, pn = 0;
  for (let s = 0; s < SURFACE_PALETTE_SLOTS; s++) {
    const ca = hexToRgb(a[Math.min(s, a.length - 1)]), cb = hexToRgb(b[Math.min(s, b.length - 1)]);
    let rgb = [ca[0] + (cb[0] - ca[0]) * blend, ca[1] + (cb[1] - ca[1]) * blend, ca[2] + (cb[2] - ca[2]) * blend];
    const glow = emissive.includes(s);
    const hsv = rgbToHsv(rgb);
    hsv[0] += dHue * (glow ? 0.4 : 1) + (unit(seed, 16 + s) * 2 - 1) * PALETTE_SLOT_JITTER.hue;
    hsv[1] = clamp01(hsv[1] * kSat);
    if (!glow) hsv[2] = clamp01(hsv[2] * kVal * (1 + (unit(seed, 32 + s) * 2 - 1) * PALETTE_SLOT_JITTER.val));
    rgb = hsvToRgb(hsv);
    if (!glow) {
      rgb = [clamp01(rgb[0] * (1 + warm) * tint.mul[0] * tint.gain), clamp01(rgb[1] * tint.mul[1] * tint.gain),
        clamp01(rgb[2] * (1 - warm) * tint.mul[2] * tint.gain)];
    }
    colors[s * 3] = srgbToLinear(rgb[0]); colors[s * 3 + 1] = srgbToLinear(rgb[1]); colors[s * 3 + 2] = srgbToLinear(rgb[2]);
    if (s < a.length && !glow) { pr += colors[s * 3]; pg += colors[s * 3 + 1]; pb += colors[s * 3 + 2]; pn++; }
  }
  // Barwa zastępcza (zanim przyjdzie mapa): średnia palety, z przewagą slotu głównego. TERRAN: slot morza i lądu.
  const main = row.look === 'TERRAN' ? [0, 1, 3] : [0, 0, 1];
  let mr = 0, mg = 0, mb = 0;
  for (const s of main) { mr += colors[s * 3]; mg += colors[s * 3 + 1]; mb += colors[s * 3 + 2]; }
  const placeholder = [(pr / pn + mr / main.length) / 2, (pg / pn + mg / main.length) / 2, (pb / pn + mb / main.length) / 2];

  return {
    archetype: body.bodyArchetype, look: SURFACE_LOOKS[row.look], lookName: row.look,
    variantA: variants[ia].id, variantB: variants[ib].id, blend,
    colors, placeholder,
    mode: row.mode ?? 0, capT: row.capT ?? -1, mThr: row.mThr ?? 2, eThr: row.eThr ?? 0, eMode: row.eMode ?? 0,
    relief: row.relief ?? 0.4, specular: row.specular ?? 0, emissive: row.emissive ?? 0, wrap: row.wrap ?? 0.02,
    hasSea: row.look === 'TERRAN' || row.look === 'CRYO',
    jitter: { hue: dHue, sat: kSat, val: kVal, warm },
  };
}

/**
 * Poziom morza ciała w kanale e (−1 = brak morza) — TEN SAM, którym klasyfikuje SurfaceField (rozgrywka, CS-5).
 * Liczony tylko dla wyglądów z morzem (terran / ocean / jungle / cryo_haze / hazy_moon); kalibracja to kilka ms, bufor
 * kontekstów SurfaceField trzyma wynik.
 */
export function surfaceSeaLevelOf(body) {
  const look = BODY_PALETTES[body?.bodyArchetype]?.look;
  if (look !== 'TERRAN' && look !== 'CRYO') return -1;
  const arch = ARCHETYPE_BY_ID[body.bodyArchetype];
  if (!arch || !Number.isFinite(body?.surfaceSeed)) return -1;
  const sea = seaLevelOf(body.surfaceSeed >>> 0, arch, { waterCoverage: body.waterCoverage ?? null, palette: null });
  return Number.isFinite(sea) ? sea : -1;
}

/** Odległość dwóch palet (średnia odległość slotów w liniowym RGB) — miara „czy dwa ciała wyglądają inaczej". */
export function paletteDistance(lookA, lookB) {
  if (!lookA || !lookB) return Infinity;
  let sum = 0;
  for (let s = 0; s < SURFACE_PALETTE_SLOTS; s++) {
    const dr = lookA.colors[s * 3] - lookB.colors[s * 3], dg = lookA.colors[s * 3 + 1] - lookB.colors[s * 3 + 1],
      db = lookA.colors[s * 3 + 2] - lookB.colors[s * 3 + 2];
    sum += Math.sqrt(dr * dr + dg * dg + db * db);
  }
  return sum / SURFACE_PALETTE_SLOTS;
}
