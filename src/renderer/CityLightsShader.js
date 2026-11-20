// CityLightsShader — światła miast na nocnej stronie ciała (ARC COLONY SPHERE, krok CS-9; plan §3.18).
//
// Cienka powłoka (kula tuż nad powierzchnią) rysowana ADDYTYWNIE. Mapa natężeń per pole przychodzi z
// `CityLightsLogic.rasterizeCityLights` (równoodległościowa, R = natężenie); punkty światła liczy shader z kierunku na
// kuli i ziarna ciała — deterministycznie, bez zegara. Im większe natężenie pola, tym WIĘCEJ punktów jest zapalonych
// (próg na losie komórki kraty) i tym jaśniejsza poświata. Światła świecą tylko po nocnej stronie: maska z iloczynu
// normalna · kierunek do gwiazdy (ten sam uniform `uSunPos`, którego używa shader powierzchni — na kuli kolonii lampa
// w układzie kamery, na mapie układu gwiazda).
//
// ⚠ Moduł ma ZERO importów three (wzór SurfaceShader): THREE jest wstrzykiwane do fabryki; teksty programów czyta keeper.
// ⚠ GLSL: w literałach nie ma odwrotnych apostrofów; `gl_Position` jest ostatnią instrukcją main (kotwica LogDepthChunks).
// ⚠ Ta sama konwencja kierunek → uv co `CityLightsLogic.lightUvOf` (keeper pilnuje lustra).

import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';
import { CITY_LIGHTS } from './CityLightsLogic.js';

export const CITY_VERT = /* glsl */`
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNormalW;

void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * vDir);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CITY_FRAG = /* glsl */`
uniform sampler2D uLights;
uniform vec3 uSunPos;
uniform vec2 uNightEdge;
uniform vec2 uDensity;
uniform float uGain;
uniform float uSeed;
uniform vec3 uWarm;
uniform vec3 uCool;
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNormalW;

const float PI = 3.141592653589793;

vec2 lightUv(vec3 d) {
  return vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Jedna warstwa punktów: krata 3D przecięta kulą; w komórce najwyżej jeden punkt, zapalony gdy los komórki < natężenie.
// Zwraca (jasność, ciepło 0…1). Gdy komórka kraty jest mniejsza od piksela, punkty przechodzą w średnią poświatę.
vec2 lightLayer(vec3 d, float dens, float I, float salt) {
  vec3 p = d * dens;
  vec3 c = floor(p);
  vec3 f = p - c;
  vec3 s = c + uSeed + salt;
  vec3 o = 0.5 + (vec3(hash13(s), hash13(s + 17.3), hash13(s + 41.7)) - 0.5) * 0.5;
  float on = step(hash13(s + 73.1), I * 1.1);
  float size = mix(0.10, 0.24, hash13(s + 5.9));
  float pt = on * (1.0 - smoothstep(size * 0.3, size, length(f - o))) * mix(0.55, 1.0, hash13(s + 91.3));
  float fw = length(fwidth(p));
  float detail = 1.0 - smoothstep(0.30, 0.85, fw);
  return vec2(mix(I * I * 0.05, pt, detail), hash13(s + 29.4));
}

void main() {
  vec3 N = normalize(vNormalW);
  float nl = dot(N, normalize(uSunPos - vWorld));
  float night = 1.0 - smoothstep(uNightEdge.x, uNightEdge.y, nl);
  float I = texture2D(uLights, lightUv(normalize(vDir))).r;
  float facing = dot(N, normalize(cameraPosition - vWorld));
  float k = night * smoothstep(0.02, 0.2, facing);
  if (I * k < 0.004) discard;
  vec3 d = normalize(vDir);
  vec2 a = lightLayer(d, uDensity.x, I, 0.0);
  vec2 b = lightLayer(d, uDensity.y, I, 113.0);
  vec3 col = mix(uWarm, uCool, step(0.78, a.y)) * a.x + mix(uWarm, uCool, step(0.6, b.y)) * b.x * 1.25;
  col += uWarm * I * I * 0.035;
  gl_FragColor = vec4(col * uGain * k, 1.0);
}
`;

export const CITY_VERT_LOGDEPTH = withLogDepthVertex(CITY_VERT);
export const CITY_FRAG_LOGDEPTH = withLogDepthFragment(CITY_FRAG);

/** Uniformy powłoki świateł. `shared.uSunPos` = ten sam obiekt uniformu co w shaderze powierzchni. */
export function createCityUniforms(texture, shared, o = {}) {
  const T = CITY_LIGHTS;
  return {
    uLights:    { value: texture },
    uSunPos:    shared?.uSunPos ?? { value: [0, 0, 0] },
    uNightEdge: { value: [T.nightEdge[0], T.nightEdge[1]] },
    uDensity:   { value: [...(o.density ?? T.heroDensity)] },
    uGain:      { value: o.gain ?? T.heroGain },
    uSeed:      { value: cityLightSeed(o.seed) },
    uWarm:      { value: [...T.warm] },
    uCool:      { value: [...T.cool] },
  };
}

/** Ziarno ciała → przesunięcie kraty punktów (0…97, deterministyczne; inne ciało = inny wzór świateł). */
export function cityLightSeed(seed) {
  const n = Number(seed) || 0;
  return ((Math.abs(Math.floor(n)) % 9973) / 9973) * 97;
}

/** Tekstura mapy natężeń z bajtów `rasterizeCityLights`. */
export function createCityTexture(THREE, data, w, h) {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Materiał powłoki świateł.
 * @param {object} THREE
 * @param {object} texture mapa natężeń
 * @param {{shared?:object, logDepth?:boolean, depthTest?:boolean, density?:number[], gain?:number, seed?:number}} [o]
 *   `depthTest: false` na kuli kolonii (powłoka wypukła, FrontSide = dokładnie ściany widoczne — jak nakładka pól);
 *   `depthTest: true` + `logDepth` na mapie układu (ciało mogą zasłaniać inne obiekty).
 */
export function createCityMaterial(THREE, texture, o = {}) {
  const logDepth = !!o.logDepth;
  const material = new THREE.ShaderMaterial({
    uniforms: createCityUniforms(texture, o.shared, o),
    vertexShader: logDepth ? CITY_VERT_LOGDEPTH : CITY_VERT,
    fragmentShader: logDepth ? CITY_FRAG_LOGDEPTH : CITY_FRAG,
    transparent: true, depthWrite: false, depthTest: o.depthTest !== false, side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
  material.userData.cityLights = true;
  return material;
}

export const CityLightsShader = {
  CITY_VERT, CITY_FRAG, CITY_VERT_LOGDEPTH, CITY_FRAG_LOGDEPTH, createCityUniforms, createCityTexture, createCityMaterial, cityLightSeed,
};
export default CityLightsShader;
