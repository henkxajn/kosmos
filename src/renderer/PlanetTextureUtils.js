// PlanetTextureUtils — współdzielony cache i loader tekstur planet
//
// Wyodrębniony z ThreeRenderer.js — używany zarówno przez widok kosmiczny
// (ThreeRenderer) jak i globus planety (PlanetGlobeRenderer).
//
// Eksportuje:
//   resolveTextureType(planet) — mapuje planetType + temperatureK na typ tekstury generatora
//   loadPlanetTextures(texType, variant) — ładuje diffuse/normal/roughness z cache
//   hashCode(str) — deterministyczny hash do seedów (wariant tekstury)
//   TEXTURE_VARIANTS — liczba wariantów per typ (3)

import * as THREE from 'three';

// ── Cache i loader (współdzielone) ──────────────────────────────
const _textureCache  = new Map();  // klucz: "rocky_01_diffuse" → THREE.Texture
const _textureLoader = new THREE.TextureLoader();
const TEXTURE_DIR    = 'assets/planet-textures';
export const TEXTURE_VARIANTS = 3; // ile wariantów per typ

/**
 * Mapowanie typu planety (gra) → typ tekstury (generator).
 * Gas → null (proceduralna tekstura canvas).
 */
export function resolveTextureType(planet) {
  const type = planet.planetType;
  if (type === 'gas') return null; // proceduralna

  if (type === 'hot_rocky') return 'volcanic';
  if (type === 'ice')       return 'ice';

  // rocky — zależne od temperatury
  const tempK = planet.temperatureK || 300;
  if (tempK > 473) return 'lava-ocean'; // >200°C — mocno gorąca
  if (tempK > 333) return 'desert';     // 60–200°C
  if (tempK > 283) return 'ocean';      // 10–60°C (strefa zamieszkiwalna)
  if (tempK > 253) return 'rocky';      // −20–10°C
  return 'iron';                        // <−20°C — zimna, ciemna
}

/**
 * Ładuje zestaw tekstur planety (diffuse + normal + roughness) z cache.
 * @param {string} texType — np. 'rocky', 'volcanic', 'ocean'
 * @param {number} variant — 1, 2, lub 3
 * @returns {{ diffuse: THREE.Texture, normal: THREE.Texture, roughness: THREE.Texture }}
 */
export function loadPlanetTextures(texType, variant) {
  const vStr   = String(variant).padStart(2, '0');
  const prefix = `${TEXTURE_DIR}/${texType}_${vStr}`;
  const maps   = {};

  const mapTypes = ['diffuse', 'normal', 'roughness'];
  for (const key of mapTypes) {
    const cacheKey = `${texType}_${vStr}_${key}`;
    if (!_textureCache.has(cacheKey)) {
      const tex = _textureLoader.load(`${prefix}_${key}.png`);
      // diffuse → sRGB, reszta → linear (dane, nie kolory)
      tex.colorSpace = (key === 'diffuse') ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      _textureCache.set(cacheKey, tex);
    }
    maps[key] = _textureCache.get(cacheKey);
  }
  return maps;
}

/** Sprawdza czy tekstura jest w cache (chroni przed dispose współdzielonych tekstur) */
export function isTextureInCache(tex) {
  for (const [, cached] of _textureCache) {
    if (cached === tex) return true;
  }
  return false;
}

// ── Hash do seedów deterministycznych ───────────────────────────
export function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
