// PlanetShader — vertex + fragment shader GLSL do renderowania proceduralnego terenu planety
//
// Używa BiomeMap (DataTexture 512×256, R=biomId, G=height, B=humidity) jako uniform sampler2D.
// Fragment shader: kolor biomu + FBM noise faktura + Lambertian diffuse + czapy polarne + atmosfera fresnel.
// Kompatybilny z WebGL 1 (brak #version 300 es).
//
// bakeVertexShader / bakeFragmentShader — RTT bake: equirectangular diffuse texture
// (bez oświetlenia/bump/atmosfery) do użycia jako map w MeshStandardMaterial (widok układu).

import * as THREE from 'three';
import { hashCode } from './PlanetTextureUtils.js';
import { getBiomeColorsForPlanet } from './TerrainTextures.js';

// ── Deterministyczny PRNG (mulberry32) ────────────────────────────────────────
export function mulberry32(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── Zakresy parametrów per typ planety ────────────────────────────────────────
const TYPE_PRESETS = {
  rocky: {
    colorTint:    [[0.85, 1.15], [0.85, 1.15], [0.85, 1.15]],  // szeroki zakres
    noiseFreq:    [0.75, 1.40],
    warpStrength: [0.02, 0.06],
    polarCap:     [0.70, 0.82],
    atmTint:      [0.08, 0.08, 0.08],  // max odchylenie od bazowego koloru
  },
  hot_rocky: {
    colorTint:    [[0.95, 1.20], [0.80, 1.05], [0.75, 0.95]],  // ciepłe tony
    noiseFreq:    [0.80, 1.30],
    warpStrength: [0.03, 0.06],
    polarCap:     [0.0, 0.0],  // brak czap
    atmTint:      [0.06, 0.06, 0.06],
  },
  ice: {
    colorTint:    [[0.85, 1.00], [0.90, 1.10], [0.95, 1.15]],  // chłodne tony
    noiseFreq:    [0.70, 1.20],
    warpStrength: [0.02, 0.06],
    polarCap:     [0.78, 0.92],  // duże czapy
    atmTint:      [0.06, 0.06, 0.06],
  },
  moon_rocky: {
    colorTint:    [[0.80, 1.10], [0.80, 1.08], [0.78, 1.05]],  // szaro-brązowe
    noiseFreq:    [0.90, 1.45],  // drobny noise
    warpStrength: [0.04, 0.12],
    polarCap:     [0.0, 0.0],  // brak czap
    atmTint:      [0.04, 0.04, 0.04],
  },
  moon_icy: {
    colorTint:    [[0.85, 1.00], [0.88, 1.05], [0.95, 1.20]],  // niebiesko-białe
    noiseFreq:    [0.75, 1.25],
    warpStrength: [0.04, 0.12],
    polarCap:     [0.80, 0.92],  // duże czapy
    atmTint:      [0.04, 0.04, 0.04],
  },
};

// ── Wspólne funkcje noise GLSL (eksportowane — współdzielone z GasGiantShader) ──
export const GLSL_NOISE_LIB = /* glsl */ `
// ── Simplex noise 2D — Stefan Gustavson (public domain) ──────────────────────
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                 + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                           dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ── Triplanar noise — bez szwu i bez rozciągania na biegunach ────────────────
float sphereNoise(vec3 p, float scale) {
  vec3 w = abs(p);
  w = w / (w.x + w.y + w.z + 0.0001);
  return snoise(p.yz * scale) * w.x
       + snoise(p.xz * scale) * w.y
       + snoise(p.xy * scale) * w.z;
}
`;

// ── Wspólny kod GLSL: uniformy biome, noise, biomeColor ──────────────────────
const GLSL_LIB = /* glsl */ `
uniform sampler2D uBiomeMap;
uniform vec3 uSeed;
uniform vec3 uColorTint;
uniform float uNoiseFreqMult;
uniform float uWarpStrength;
uniform float uPolarCap;
uniform vec3 uBiomeColors[10]; // kolory biomów próbkowane z tekstur terenu

${GLSL_NOISE_LIB}

// ── Kolor bazowy biomu — dynamiczny z uBiomeColors[] ─────────────────────────
// Bazowy kolor z uniform + wariacja height/humidity dla głębi wizualnej
vec3 biomeColor(float bId, float height, float humidity) {
  int idx = int(bId + 0.5);
  vec3 base;
  // WebGL 1: brak indeksowania dynamicznego → if/else
  if (idx == 0)      base = uBiomeColors[0];
  else if (idx == 1) base = uBiomeColors[1];
  else if (idx == 2) base = uBiomeColors[2];
  else if (idx == 3) base = uBiomeColors[3];
  else if (idx == 4) base = uBiomeColors[4];
  else if (idx == 5) base = uBiomeColors[5];
  else if (idx == 6) base = uBiomeColors[6];
  else if (idx == 7) base = uBiomeColors[7];
  else if (idx == 8) base = uBiomeColors[8];
  else               base = uBiomeColors[9];

  // Wariacja jasności wg height/humidity — zachowuje naturalny wygląd
  float variation = mix(height, humidity, 0.5);
  return mix(base * 0.82, base * 1.18, variation);
}

// ── Helper: pełny odczyt BiomeMap + kolor biomu dla danego UV ─────────────────
vec3 biomeColor_fromUv(vec2 uv) {
  vec4 bd = texture2D(uBiomeMap, uv);
  float id = bd.r * 255.0;
  float h  = bd.g * 255.0 / 220.0;
  float hu = bd.b;
  return biomeColor(id, h, hu);
}
`;

// ── Wspólny blok: domain warp + biome sample + noise + tint + lava + polar ───
// Używany przez fragmentShader i bakeFragmentShader (identyczna logika koloru)
const GLSL_COLOR_BODY = /* glsl */ `
  // 1. Domain warping
  float wx = sphereNoise(sp + vec3(1.7, 0.0, 9.2), 6.0 * fm);
  float wy = sphereNoise(sp + vec3(8.3, 0.0, 2.8), 6.0 * fm);
  vec2 warpedUv = biomeUv + vec2(wx, wy) * uWarpStrength;

  // 2. Odczytaj BiomeMap z warpowanego UV
  vec4 biomeData = texture2D(uBiomeMap, warpedUv);
  float bId      = biomeData.r * 255.0;
  float height   = biomeData.g * 255.0 / 220.0;
  float humidity = biomeData.b;

  // 3. Kolor bazowy biomu — blur kolorów z sąsiednich próbek
  float bs = 0.015;
  vec3 c0 = biomeColor_fromUv(warpedUv);
  vec3 c1 = biomeColor_fromUv(warpedUv + vec2(bs, 0.0));
  vec3 c2 = biomeColor_fromUv(warpedUv + vec2(-bs, 0.0));
  vec3 c3 = biomeColor_fromUv(warpedUv + vec2(0.0, bs));
  vec3 c4 = biomeColor_fromUv(warpedUv + vec2(0.0, -bs));
  vec3 color = (c0 * 2.0 + c1 + c2 + c3 + c4) / 6.0;

  // 4. Noise faktura — 6 warstw FBM
  float n  = sphereNoise(sp, 8.0 * fm) * 0.500
           + sphereNoise(sp, 16.8 * fm) * 0.250
           + sphereNoise(sp, 34.4 * fm) * 0.125
           + sphereNoise(sp, 69.6 * fm) * 0.063
           + sphereNoise(sp, 140.0 * fm) * 0.031
           + sphereNoise(sp, 280.0 * fm) * 0.016;
  n = n * 0.5 + 0.5;

  // 5. Modulacja koloru przez noise
  float noiseStrength = 0.35;
  if (bId >= 0.5 && bId < 1.5) noiseStrength = 0.45;  // mountains
  if (bId >= 5.5 && bId < 6.5) noiseStrength = 0.50;  // volcano
  if (bId >= 1.5 && bId < 2.5) noiseStrength = 0.20;  // ocean
  if (bId >= 7.5 && bId < 8.5) noiseStrength = 0.25;  // ice
  color = color * (1.0 - noiseStrength + n * noiseStrength * 2.0);

  // 5b. Color tint
  color *= uColorTint;

  // 8. Lava glow — wulkan (bId ~6.0)
  if (bId >= 5.5 && bId < 6.5) {
    float lavaNoise = sphereNoise(sp, 18.0 * fm) * 0.5 + 0.5;
    float lavaGlow = pow(lavaNoise, 3.0);
    color = mix(color, vec3(1.0, 0.35, 0.05), lavaGlow * 0.55);
    color += vec3(0.4, 0.08, 0.0) * lavaGlow * 0.3;
  }

  // 9. Czapy polarne
  if (uPolarCap > 0.0) {
    float lat = abs(biomeUv.y - 0.5) * 2.0;
    float iceNoise = sphereNoise(sp, 20.0) * 0.04;
    float iceMask = smoothstep(uPolarCap - 0.02 + iceNoise, uPolarCap + 0.02 + iceNoise, lat);
    vec3 iceColor = vec3(0.90, 0.95, 1.00);
    color = mix(color, iceColor, iceMask);
  }
`;

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vSpherePos;  // pozycja na sferze (model space, ciągła — bez szwu UV)
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vSpherePos = normalize(position);  // unit sphere — ciągłe koordynaty
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const fragmentShader = /* glsl */ `
${GLSL_LIB}
uniform sampler2D uBuildingMap;
uniform float uRotationSpeed;
uniform vec3 uLightDir;
uniform float uTime;
uniform int uHasAtmosphere;
uniform vec3 uAtmosphereColor;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vSpherePos;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec3 sp = vSpherePos + uSeed;
  float fm = uNoiseFreqMult;

  // Rotacja planety — przesuń UV poziomo przez czas
  // Bez fract() — RepeatWrapping na teksturze obsługuje wrap seamlessly
  float rotationOffset = uTime * 0.008;
  vec2 biomeUv = vec2(1.0 - vUv.x + rotationOffset, 1.0 - vUv.y);

  ${GLSL_COLOR_BODY}

  // 6. Fake bump mapping + oświetlenie
  float bumpScale = 0.0;
  if (bId < 1.5) bumpScale = 0.012;                   // plains — delikatne wzgórza
  if (bId >= 1.5 && bId < 2.5) bumpScale = 0.035;     // mountains — mocne
  if (bId >= 3.5 && bId < 4.5) bumpScale = 0.008;     // desert — wydmy
  if (bId >= 5.5 && bId < 6.5) bumpScale = 0.045;     // volcano — skaliste

  float diff;
  vec3 normal = vWorldNormal;
  if (bumpScale > 0.0) {
    float eps = 0.002;
    float bnx = sphereNoise(sp + vec3(eps, 0.0, 0.0), 12.0 * fm) - sphereNoise(sp - vec3(eps, 0.0, 0.0), 12.0 * fm);
    float bny = sphereNoise(sp + vec3(0.0, eps, 0.0), 12.0 * fm) - sphereNoise(sp - vec3(0.0, eps, 0.0), 12.0 * fm);
    normal = normalize(vWorldNormal + vec3(bnx, bny, 0.0) * bumpScale);
  }
  diff = dot(normal, normalize(uLightDir));

  // Dzień/noc maska
  float nightMask = smoothstep(-0.05, 0.20, -diff);
  float dayMask   = 1.0 - nightMask;

  // Dzień — normalne oświetlenie
  float ambient = 0.25;
  vec3 dayColor = color * (ambient + (1.0 - ambient) * max(diff, 0.0));

  // Noc — ciemny granat
  vec3 nightColor = color * 0.015 + vec3(0.005, 0.005, 0.012);

  // Blend między dniem a nocą
  color = mix(dayColor, nightColor, nightMask);

  // 7. Specular — tylko ocean (bId ~2.0), tylko dzień
  if (bId >= 1.5 && bId < 2.5) {
    vec3 lightDir = normalize(uLightDir);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(vViewDir, reflectDir), 0.0), 48.0);
    color += vec3(0.8, 0.9, 1.0) * spec * 0.45 * dayMask;
  }

  // Światła budynków — tylko na nocnej stronie, tylko białe
  vec4 buildingData = texture2D(uBuildingMap, biomeUv);
  float hasBuilding = buildingData.r;

  if (hasBuilding > 0.5 && nightMask > 0.15) {
    // Gaussowski glow — miękki blask wokół punktu świetlnego
    float glowSize = 3.0 / 512.0;
    float glow = 0.0;
    glow += texture2D(uBuildingMap, biomeUv + vec2(glowSize,  0.0)).r * 0.50;
    glow += texture2D(uBuildingMap, biomeUv + vec2(-glowSize, 0.0)).r * 0.50;
    glow += texture2D(uBuildingMap, biomeUv + vec2(0.0,  glowSize)).r * 0.50;
    glow += texture2D(uBuildingMap, biomeUv + vec2(0.0, -glowSize)).r * 0.50;
    glow += texture2D(uBuildingMap, biomeUv + vec2(glowSize,  glowSize)).r * 0.25;
    glow += texture2D(uBuildingMap, biomeUv + vec2(-glowSize, glowSize)).r * 0.25;
    glow += texture2D(uBuildingMap, biomeUv + vec2(glowSize, -glowSize)).r * 0.25;
    glow += texture2D(uBuildingMap, biomeUv + vec2(-glowSize,-glowSize)).r * 0.25;

    float intensity = nightMask * 0.90;
    float glowIntensity = (glow / 3.0) * nightMask * 0.45;

    // Tylko białe światło
    color += vec3(1.0, 0.97, 0.90) * (intensity + glowIntensity);
  }

  // Terminator — delikatna pomarańczowa poświata na granicy dnia i nocy
  float terminator = exp(-abs(diff) * 8.0);
  color += vec3(0.4, 0.2, 0.05) * terminator * 0.15;

  // 10. Atmosfera — fake Rayleigh scattering
  if (uHasAtmosphere == 1) {
    // Grubość atmosfery przez fresnel (kąt patrzenia)
    float cosView = max(dot(vNormal, vViewDir), 0.0);
    float fresnel = 1.0 - cosView;
    fresnel = pow(fresnel, 2.2);

    // Kąt słońca w tym punkcie atmosfery
    float sunAngle = dot(vWorldNormal, normalize(uLightDir));

    // Dzień — niebieski/cyan od strony słońca
    float dayAtm = max(sunAngle, 0.0);
    vec3 dayAtmColor = mix(
      uAtmosphereColor,
      uAtmosphereColor * vec3(1.2, 1.1, 0.9),
      dayAtm * 0.6
    );

    // Terminator — pomarańczowo-czerwony pas na granicy dzień/noc
    float termWidth = 0.18;
    float atmTerminator = exp(-abs(sunAngle) / termWidth);
    atmTerminator = pow(atmTerminator, 1.5);
    vec3 terminatorColor = vec3(1.0, 0.45, 0.15);

    // Noc — atmosfera prawie niewidoczna, delikatny granat
    vec3 nightAtmColor = uAtmosphereColor * vec3(0.15, 0.18, 0.35);

    // Blend wszystkich składowych atmosfery
    vec3 atmColor = mix(dayAtmColor, nightAtmColor, smoothstep(-0.1, 0.3, -sunAngle));
    atmColor = mix(atmColor, terminatorColor, atmTerminator * 0.65);

    // Intensywność atmosfery przez fresnel + limb brightening
    float atmStrength = fresnel * 0.50;
    float limb = pow(fresnel, 5.0) * 0.35;
    atmStrength += limb;

    color = mix(color, atmColor, atmStrength);

    // Zewnętrzny glow atmosfery — aureola na samej krawędzi
    if (fresnel > 0.85) {
      float outerGlow = (fresnel - 0.85) / 0.15;
      color = mix(color, atmColor * 1.3, outerGlow * 0.4);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

// ── Bake vertex shader — passthrough fullscreen quad ─────────────────────────
const bakeVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ── Bake fragment shader — equirectangular → sphere → kolor (BEZ oświetlenia) ─
const bakeFragmentShader = /* glsl */ `
${GLSL_LIB}
varying vec2 vUv;

void main() {
  // UV → sfera (equirectangular projection)
  float lon = vUv.x * 6.28318530;
  float lat = (1.0 - vUv.y) * 3.14159265;
  vec3 spherePos = vec3(sin(lat) * cos(lon), cos(lat), sin(lat) * sin(lon));

  vec3 sp = spherePos + uSeed;
  float fm = uNoiseFreqMult;
  vec2 biomeUv = vec2(vUv.x, 1.0 - vUv.y);

  ${GLSL_COLOR_BODY}

  gl_FragColor = vec4(color, 1.0);
}
`;

// ── Helper: losowa wartość z zakresu ──────────────────────────────────────────
export function rngRange(rng, min, max) { return min + rng() * (max - min); }

// ── Wspólna logika generowania parametrów presetu ────────────────────────────
function _resolvePresetParams(planet) {
  const rng = mulberry32(hashCode(String(planet.id)));

  const pType = planet.planetType ?? 'rocky';
  let presetKey = pType;
  if (planet.type === 'moon') {
    const moonType = planet.moonType ?? 'rocky';
    presetKey = moonType.includes('ic') ? 'moon_icy' : 'moon_rocky';
  } else if (pType === 'volcanic' || pType === 'desert') {
    presetKey = 'hot_rocky';
  } else if (pType === 'ice') {
    presetKey = 'ice';
  } else {
    presetKey = 'rocky';
  }
  const preset = TYPE_PRESETS[presetKey] ?? TYPE_PRESETS.rocky;

  const seed = new THREE.Vector3(
    rngRange(rng, -50, 50),
    rngRange(rng, -50, 50),
    rngRange(rng, -50, 50),
  );
  const colorTint = new THREE.Vector3(
    rngRange(rng, preset.colorTint[0][0], preset.colorTint[0][1]),
    rngRange(rng, preset.colorTint[1][0], preset.colorTint[1][1]),
    rngRange(rng, preset.colorTint[2][0], preset.colorTint[2][1]),
  );
  const noiseFreqMult = rngRange(rng, preset.noiseFreq[0], preset.noiseFreq[1]);
  const warpStrength  = rngRange(rng, preset.warpStrength[0], preset.warpStrength[1]);
  const polarCap      = rngRange(rng, preset.polarCap[0], preset.polarCap[1]);

  return { rng, pType, preset, seed, colorTint, noiseFreqMult, warpStrength, polarCap };
}

// ── createUniforms — obiekt uniforms dla THREE.ShaderMaterial (globus) ───────
function createUniforms(planet, biomeMapTexture, buildingMapTexture) {
  const { rng, pType, preset, seed, colorTint, noiseFreqMult, warpStrength, polarCap } =
    _resolvePresetParams(planet);

  // Bazowe kolory atmosfery per typ
  const atmColors = {
    rocky:    [0.27, 0.53, 1.00],
    ice:      [0.60, 0.80, 1.00],
    volcanic: [0.80, 0.35, 0.10],
    desert:   [0.85, 0.65, 0.30],
    ocean:    [0.20, 0.55, 1.00],
  };

  const hasAtm = (planet.atmosphere && planet.atmosphere !== 'none' && planet.atmosphere !== 'brak') ? 1 : 0;
  const baseAtm = atmColors[pType] ?? atmColors.rocky;
  const atmC = baseAtm.map((c, i) => Math.max(0, Math.min(1, c + (rng() - 0.5) * 2 * preset.atmTint[i])));

  // Pusta tekstura fallback jeśli brak buildingMapTexture
  const emptyBuildingTex = buildingMapTexture ?? new THREE.DataTexture(
    new Uint8Array(4), 1, 1, THREE.RGBAFormat
  );
  if (!buildingMapTexture) emptyBuildingTex.needsUpdate = true;

  // Kolory biomów próbkowane z tekstur terenu (per planeta)
  const biomeColors = getBiomeColorsForPlanet(planet);
  const biomeColorVecs = [];
  for (let i = 0; i < 10; i++) {
    biomeColorVecs.push(new THREE.Vector3(
      biomeColors[i * 3], biomeColors[i * 3 + 1], biomeColors[i * 3 + 2]
    ));
  }

  return {
    uBiomeMap:        { value: biomeMapTexture },
    uBuildingMap:     { value: emptyBuildingTex },
    uBiomeColors:     { value: biomeColorVecs },
    uRotationSpeed:   { value: 0.08 },
    uLightDir:        { value: new THREE.Vector3(3, 2, 4).normalize() },
    uTime:            { value: 0.0 },
    uPolarCap:        { value: polarCap },
    uHasAtmosphere:   { value: hasAtm },
    uAtmosphereColor: { value: new THREE.Vector3(...atmC) },
    uSeed:            { value: seed },
    uColorTint:       { value: colorTint },
    uNoiseFreqMult:   { value: noiseFreqMult },
    uWarpStrength:    { value: warpStrength },
  };
}

// ── createBakeUniforms — podzbiór uniformów do RTT bake (bez oświetlenia) ────
function createBakeUniforms(planet, biomeMapTexture) {
  const { seed, colorTint, noiseFreqMult, warpStrength, polarCap } =
    _resolvePresetParams(planet);

  // Kolory biomów próbkowane z tekstur terenu (per planeta)
  const biomeColors = getBiomeColorsForPlanet(planet);
  const biomeColorVecs = [];
  for (let i = 0; i < 10; i++) {
    biomeColorVecs.push(new THREE.Vector3(
      biomeColors[i * 3], biomeColors[i * 3 + 1], biomeColors[i * 3 + 2]
    ));
  }

  return {
    uBiomeMap:      { value: biomeMapTexture },
    uBiomeColors:   { value: biomeColorVecs },
    uSeed:          { value: seed },
    uColorTint:     { value: colorTint },
    uNoiseFreqMult: { value: noiseFreqMult },
    uWarpStrength:  { value: warpStrength },
    uPolarCap:      { value: polarCap },
  };
}

export const PlanetShader = {
  vertexShader,
  fragmentShader,
  bakeVertexShader,
  bakeFragmentShader,
  createUniforms,
  createBakeUniforms,
};
