// KOSMOS — GasUniformsDigest: odcisk uniformów bake'u gazowego olbrzyma (ARC COLONY SPHERE, krok CS-3b).
//
// Po co: dowód „GasGiantShader daje to samo przed i po CS-3b" (D-CS-5: archetyp gazu tylko ZAPISUJE rodzinę presetu;
// wygląd bit w bit jak dziś). `GasGiantShader.js` nie importuje się pod node — łańcuch PlanetTextureUtils tworzy
// `new THREE.TextureLoader()` na poziomie modułu, a śledzony stub `three` celowo go NIE ma (granica dowodu, Finding 683).
// Ten helper NIE rusza stubu: rejestruje hook modułów (node:module registerHooks) LOKALNY dla procesu, który podmienia
// specyfikator 'three' WYŁĄCZNIE dla trzech plików renderera (GasGiantShader / PlanetTextureUtils / PlanetShader) na
// atrapę z klasami potrzebnymi do policzenia uniformów (Vector2/3/4, Color, DataTexture, TextureLoader, stałe).
// Reszta procesu (GameCore → GlbSnapshotRenderer) dalej widzi zwykły stub.
//
// Odcisk = SHA-256 kanonicznego JSON-a `createGasBakeUniforms(planet)` (wektory → składowe, DataTexture → dane pikseli,
// wymiary, format, filtry) dla podanych ciał. Wołający podaje URL katalogu `src/` — ten sam kod liczy odcisk drzewa
// roboczego (keeper) i `git worktree --detach <base>` (nagranie śladu).

import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';

const RENDERER_FILES = /\/src\/renderer\/(GasGiantShader|PlanetTextureUtils|PlanetShader)\.js(\?.*)?$/;

const FAKE_THREE = `
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
export class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
export class Vector4 { constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; } }
export class Color { constructor(r = 1, g = 1, b = 1) { this.r = r; this.g = g; this.b = b; } }
export class DataTexture { constructor(data, width, height, format) { this.data = data; this.width = width; this.height = height; this.format = format; } }
export class TextureLoader { load() { return {}; } }
export class ShaderMaterial { constructor(p = {}) { Object.assign(this, p); } }
export class WebGLRenderTarget { constructor(w, h, o = {}) { this.width = w; this.height = h; this.options = o; } }
export class Scene { add() {} }
export class OrthographicCamera { }
export class Mesh { }
export class PlaneGeometry { }
export const RGBAFormat = 'RGBAFormat', LinearFilter = 'LinearFilter', RepeatWrapping = 'RepeatWrapping',
  ClampToEdgeWrapping = 'ClampToEdgeWrapping', SRGBColorSpace = 'srgb', LinearSRGBColorSpace = 'srgb-linear',
  UnsignedByteType = 'UnsignedByteType', LinearMipmapLinearFilter = 'LinearMipmapLinearFilter', NearestFilter = 'NearestFilter';
`;
const FAKE_URL = 'data:text/javascript,' + encodeURIComponent(FAKE_THREE);

let _hooked = false;
function ensureHook() {
  if (_hooked) return;
  _hooked = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'three' && RENDERER_FILES.test(String(context.parentURL ?? '').replace(/\\/g, '/'))) {
        return { url: FAKE_URL, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

function canonical(v) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) return `"${String(v)}"`;
    if (typeof v === 'function' || v === undefined) return 'null';
    return JSON.stringify(v);
  }
  if (ArrayBuffer.isView(v)) return '[' + Array.from(v).join(',') + ']';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v).filter(k => typeof v[k] !== 'function').sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

/** Stały zestaw ciał gazowych: progi presetów (−73 / −193 °C), brak temperatury, różne id. */
export const GAS_DIGEST_BODIES = [
  { id: 'gas_fx_1', type: 'planet', planetType: 'gas', temperatureC: -40 },
  { id: 'gas_fx_2', type: 'planet', planetType: 'gas', temperatureC: -73 },
  { id: 'gas_fx_3', type: 'planet', planetType: 'gas', temperatureC: -120 },
  { id: 'gas_fx_4', type: 'planet', planetType: 'gas', temperatureC: -193 },
  { id: 'gas_fx_5', type: 'planet', planetType: 'gas', temperatureC: -210 },
  { id: 'gas_fx_6', type: 'planet', planetType: 'gas', temperatureK: 140 },
  { id: 'entity_42', type: 'planet', planetType: 'gas', temperatureC: -160.5 },
];

/**
 * @param {string|URL} srcRootUrl — URL katalogu `src/` (z ukośnikiem na końcu)
 * @param {Array<object>} bodies
 * @returns {Promise<{ sha256: string, perBody: Object<string,string>, err?: string }>}
 */
export async function gasUniformsDigest(srcRootUrl, bodies = GAS_DIGEST_BODIES) {
  ensureHook();
  let mod;
  try { mod = await import(new URL('renderer/GasGiantShader.js', srcRootUrl).href); }
  catch (e) { return { sha256: null, perBody: {}, err: String(e?.message ?? e) }; }
  const fn = mod.GasGiantShader?.createGasBakeUniforms ?? mod.createGasBakeUniforms;
  if (typeof fn !== 'function') return { sha256: null, perBody: {}, err: 'createGasBakeUniforms brak' };
  const perBody = {};
  const all = createHash('sha256');
  for (const b of bodies) {
    const json = canonical(fn(b));
    perBody[b.id] = createHash('sha256').update(json).digest('hex');
    all.update(b.id + ':' + json + '\n');
  }
  return { sha256: all.digest('hex'), perBody };
}
