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
 * Zwraca klucz odpowiadający typowi w PLANET_TYPES generatora.
 */
export function resolveTextureType(planet) {
  // Planetoidy — pod-typ wg planetoidType
  if (planet.type === 'planetoid') {
    return `planetoid_${planet.planetoidType || 'silicate'}`;
  }

  const type = planet.planetType;

  // Gas giganty — pod-typ wg temperatury
  if (type === 'gas') {
    const tempC = planet.temperatureC ?? (planet.temperatureK ? planet.temperatureK - 273.15 : -123);
    if (tempC > -73)  return 'gas_warm';   // >-73°C (było >200K)
    if (tempC < -193) return 'gas_cold';   // <-193°C (było <80K)
    return 'gas_giant';
  }

  // hot_rocky — pod-typ wg masy: małe = merkury (szare), duże = wulkaniczne (czerwone)
  if (type === 'hot_rocky') {
    const mass = planet.physics?.mass ?? 1;
    return mass < 0.5 ? 'mercury' : 'volcanic';
  }
  if (type === 'ice')       return 'ice';

  // rocky — zależne od temperatury (progi °C, równoważne starym progom K)
  const tempC = planet.temperatureC ?? (planet.temperatureK ? planet.temperatureK - 273.15 : 27);
  if (tempC > 200) return 'lava-ocean'; // >200°C — mocno gorąca
  if (tempC > 110) return 'toxic';      // 110–200°C — toksyczna atmosfera (Wenus-like)
  if (tempC > 60)  return 'desert';     // 60–110°C — pustynna
  if (tempC > 10)  return 'ocean';      // 10–60°C (strefa zamieszkiwalna)
  if (tempC > -20) return 'rocky';      // −20–10°C
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

/**
 * Ładuje zestaw tekstur gwiazdy (diffuse + emission + normal) z cache.
 * @param {string} texType — np. 'star_M', 'star_G'
 * @param {number} variant — 1, 2, lub 3
 * @returns {{ diffuse: THREE.Texture, emission: THREE.Texture, normal: THREE.Texture }}
 */
export function loadStarTextures(texType, variant) {
  const vStr   = String(variant).padStart(2, '0');
  const prefix = `${TEXTURE_DIR}/${texType}_${vStr}`;
  const maps   = {};

  const mapTypes = ['diffuse', 'emission', 'normal'];
  for (const key of mapTypes) {
    const cacheKey = `${texType}_${vStr}_${key}`;
    if (!_textureCache.has(cacheKey)) {
      const tex = _textureLoader.load(`${prefix}_${key}.png`);
      // diffuse i emission → sRGB, normal → linear (dane)
      tex.colorSpace = (key === 'normal') ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
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
