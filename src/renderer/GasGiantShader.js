// GasGiantShader — proceduralny shader GLSL do RTT bake tekstur gazowych gigantów
//
// Pipeline: createGasBakeUniforms(planet) → 3× RTT pass (diffuse/normal/roughness)
// → tekstury render-targetów, cache per renderer → planet.id
//
// Generuje: pasy szerokościowe (zonal flow), turbulencje Kelvin-Helmholtz,
// burze owalne (wiry), polar darkening — deterministycznie z planet.id seed.
//
// Trzy pod-typy wg temperatury: gas_warm, gas_giant, gas_cold
// Kompatybilny z WebGL 1 (brak #version 300 es).

import * as THREE from 'three';
import { hashCode, resolveMaxAnisotropy } from './PlanetTextureUtils.js';
import { GLSL_NOISE_LIB, mulberry32, rngRange } from './PlanetShader.js';
import { resolveTextureType } from './PlanetTextureUtils.js';

// ── Cache baked tekstur: renderer → planet.id ────────────────────────────────
// ⚠ KLUCZ MUSI ZAWIERAĆ RENDERER. bakeGasGiantTextures wołają DWA rendererzy:
// ThreeRenderer (mapa 3D — kontekst na całą sesję) i PlanetGlobeRenderer (globus
// panelu kolonii — WŁASNY WebGLRenderer, którego close() robi forceContextLoss()
// przy KAŻDYM zamknięciu panelu i KAŻDEJ zmianie kolonii). Dopóki cache trzymał
// CanvasTexture, wspólny klucz `gas_<id>` był nieszkodliwy: dane leżą po stronie
// CPU, więc każdy renderer wgrywał sobie własną kopię. Tekstura render-targetu
// należy do JEDNEGO kontekstu GL — oddana drugiemu rendererowi wiąże się jako null
// (WebGLProperties jest per-renderer, a setTexture2D pomija upload dla
// isRenderTargetTexture) i planeta wychodzi CZARNA; wpis po martwym kontekście
// globusa zostawałby w cache NA ZAWSZE. WeakMap: wpisy giną razem z rendererem —
// nowy kontekst = świeży bake, bez własnej ścieżki eviction.
const _gasTextureCache = new WeakMap();   // WebGLRenderer → Map<cacheKey, entry>

// ── Presets per pod-typ gazowego giganta ──────────────────────────────────────
// Każdy preset ma wiele palet — PRNG z planet.id losuje jedną z nich.
const GAS_PRESETS = {
  gas_warm: {
    bandCount:   [8, 14],
    turbulence:  [0.08, 0.15],
    stormProb:   0.6,
    stormMax:    5,
    polarDark:   [0.15, 0.30],
    palettes: [
      // 0: Klasyczny gorący Jowisz — czerwono-brązowo-pomarańczowy
      [
        [0.55, 0.25, 0.12],  // brick red
        [0.45, 0.22, 0.10],  // deep russet
        [0.75, 0.55, 0.30],  // tan-orange
        [0.80, 0.65, 0.35],  // gold
        [0.65, 0.35, 0.15],  // burnt orange
        [0.85, 0.75, 0.50],  // pale gold
        [0.50, 0.28, 0.12],  // dark brown
        [0.70, 0.48, 0.22],  // amber
      ],
      // 1: Lawa — intensywne czerwienie i czernie (bardzo gorący)
      [
        [0.70, 0.12, 0.05],  // magma red
        [0.35, 0.08, 0.04],  // dark crimson
        [0.85, 0.30, 0.08],  // bright orange-red
        [0.20, 0.06, 0.03],  // almost black-red
        [0.60, 0.18, 0.06],  // rust
        [0.92, 0.45, 0.12],  // flame orange
        [0.28, 0.10, 0.05],  // charcoal red
        [0.75, 0.22, 0.07],  // scarlet
      ],
      // 2: Miedziany — ciepłe złoto z zielonkawymi odcieniami
      [
        [0.72, 0.52, 0.22],  // copper
        [0.55, 0.40, 0.18],  // bronze
        [0.85, 0.70, 0.35],  // brass gold
        [0.45, 0.38, 0.20],  // olive bronze
        [0.78, 0.58, 0.25],  // golden amber
        [0.38, 0.32, 0.15],  // dark olive
        [0.65, 0.48, 0.20],  // antique gold
        [0.90, 0.78, 0.42],  // light gold
      ],
      // 3: Magentowy — fioletowo-różowe tony (egzotyczny)
      [
        [0.55, 0.18, 0.35],  // plum
        [0.72, 0.28, 0.45],  // magenta pink
        [0.40, 0.12, 0.25],  // dark berry
        [0.85, 0.45, 0.55],  // rose
        [0.60, 0.22, 0.40],  // wine
        [0.75, 0.35, 0.50],  // hot pink muted
        [0.48, 0.15, 0.30],  // maroon-purple
        [0.90, 0.55, 0.60],  // salmon pink
      ],
      // 4: Rdzawy Mars — brązy i pomarańcze z szarym pyłem
      [
        [0.62, 0.35, 0.18],  // rusty orange
        [0.48, 0.28, 0.15],  // raw sienna
        [0.75, 0.48, 0.22],  // clay orange
        [0.35, 0.25, 0.18],  // dusty brown
        [0.58, 0.38, 0.20],  // terracotta
        [0.82, 0.60, 0.32],  // sand
        [0.42, 0.30, 0.20],  // umber
        [0.70, 0.42, 0.18],  // burnt sienna
      ],
      // 5: Siarkowo-żółty — żółcie z oliwkowym i brązem
      [
        [0.78, 0.72, 0.20],  // sulfur yellow
        [0.55, 0.50, 0.12],  // olive yellow
        [0.88, 0.82, 0.35],  // pale lemon
        [0.45, 0.40, 0.10],  // dark mustard
        [0.70, 0.62, 0.15],  // gold-olive
        [0.60, 0.52, 0.14],  // khaki
        [0.82, 0.75, 0.28],  // saffron
        [0.50, 0.45, 0.12],  // dark olive-gold
      ],
    ],
  },
  gas_giant: {
    bandCount:   [10, 18],
    turbulence:  [0.05, 0.10],
    stormProb:   0.4,
    stormMax:    4,
    polarDark:   [0.10, 0.25],
    palettes: [
      // 0: Klasyczny Jupiter — tan, cream, brąz, pomarańcz
      [
        [0.85, 0.78, 0.65],  // cream
        [0.50, 0.38, 0.25],  // coffee brown
        [0.80, 0.72, 0.58],  // pale tan
        [0.65, 0.45, 0.25],  // rusty orange
        [0.90, 0.88, 0.82],  // white zone
        [0.75, 0.50, 0.25],  // orange belt
        [0.70, 0.62, 0.48],  // warm tan
        [0.58, 0.42, 0.28],  // medium brown
      ],
      // 1: Saturn — blady żółto-złoty, pastelowy
      [
        [0.90, 0.85, 0.68],  // pale gold
        [0.82, 0.78, 0.62],  // wheat
        [0.75, 0.70, 0.55],  // dusty gold
        [0.88, 0.82, 0.60],  // champagne
        [0.70, 0.65, 0.48],  // warm khaki
        [0.95, 0.90, 0.75],  // ivory
        [0.78, 0.72, 0.52],  // harvest gold
        [0.85, 0.80, 0.65],  // pale butter
      ],
      // 2: Kremowo-oliwkowy — zielonkawe brązy (nietypowy)
      [
        [0.65, 0.62, 0.45],  // olive tan
        [0.50, 0.48, 0.32],  // dark olive
        [0.78, 0.75, 0.58],  // light olive cream
        [0.55, 0.52, 0.35],  // sage brown
        [0.85, 0.82, 0.68],  // pale olive cream
        [0.45, 0.42, 0.28],  // moss
        [0.72, 0.68, 0.50],  // khaki
        [0.60, 0.58, 0.40],  // army tan
      ],
      // 3: Łososiowy — ciepłe różowo-pomarańczowe tony
      [
        [0.88, 0.72, 0.62],  // peach
        [0.75, 0.55, 0.45],  // muted salmon
        [0.92, 0.80, 0.70],  // light peach
        [0.65, 0.45, 0.38],  // dusty rose
        [0.82, 0.65, 0.55],  // warm pink-tan
        [0.95, 0.88, 0.80],  // cream pink
        [0.70, 0.50, 0.42],  // sienna pink
        [0.85, 0.70, 0.60],  // nude
      ],
      // 4: Czekoladowy — głębokie brązy z kremem
      [
        [0.40, 0.25, 0.15],  // dark chocolate
        [0.55, 0.35, 0.20],  // milk chocolate
        [0.75, 0.60, 0.42],  // mocha
        [0.30, 0.18, 0.10],  // espresso
        [0.85, 0.75, 0.58],  // latte cream
        [0.48, 0.30, 0.18],  // cocoa
        [0.65, 0.48, 0.30],  // caramel
        [0.90, 0.82, 0.65],  // vanilla
      ],
      // 5: Szaro-biały — minimalistyczny, subtelne pasy
      [
        [0.82, 0.80, 0.78],  // light grey
        [0.92, 0.90, 0.88],  // off-white
        [0.70, 0.68, 0.65],  // medium grey
        [0.88, 0.86, 0.83],  // warm white
        [0.75, 0.72, 0.68],  // silver tan
        [0.95, 0.93, 0.90],  // near-white
        [0.65, 0.62, 0.58],  // cool grey
        [0.85, 0.82, 0.78],  // pearl
      ],
      // 6: Bursztynowy — intensywne pomarańcze z brązem
      [
        [0.85, 0.55, 0.15],  // amber
        [0.65, 0.38, 0.10],  // dark amber
        [0.92, 0.68, 0.25],  // golden amber
        [0.55, 0.30, 0.08],  // brown-amber
        [0.78, 0.48, 0.12],  // burnt amber
        [0.95, 0.75, 0.35],  // light amber
        [0.70, 0.42, 0.10],  // whiskey
        [0.88, 0.62, 0.20],  // honey
      ],
      // 7: Fioletowo-brązowy — egzotyczny gas giant
      [
        [0.52, 0.38, 0.48],  // dusty mauve
        [0.65, 0.50, 0.55],  // muted purple-brown
        [0.42, 0.30, 0.38],  // dark plum-brown
        [0.78, 0.68, 0.70],  // pale lavender-grey
        [0.58, 0.42, 0.50],  // wine-brown
        [0.72, 0.60, 0.62],  // rose grey
        [0.48, 0.35, 0.42],  // purple-umber
        [0.85, 0.78, 0.78],  // pale pink-grey
      ],
    ],
  },
  gas_cold: {
    bandCount:   [6, 10],
    turbulence:  [0.02, 0.05],
    stormProb:   0.2,
    stormMax:    2,
    polarDark:   [0.05, 0.15],
    palettes: [
      // 0: Klasyczny Neptune — niebieski
      [
        [0.35, 0.55, 0.80],  // medium blue
        [0.55, 0.70, 0.85],  // pale blue
        [0.18, 0.38, 0.62],  // deep blue
        [0.75, 0.82, 0.90],  // ice white
        [0.25, 0.48, 0.72],  // teal blue
        [0.65, 0.78, 0.88],  // light blue
        [0.15, 0.32, 0.55],  // dark navy
        [0.45, 0.62, 0.78],  // sky blue
      ],
      // 1: Uranus — cyjanowo-zielonkawy
      [
        [0.45, 0.72, 0.75],  // teal
        [0.55, 0.78, 0.78],  // aqua
        [0.30, 0.58, 0.62],  // dark cyan
        [0.70, 0.85, 0.85],  // pale aqua
        [0.38, 0.65, 0.68],  // ocean teal
        [0.60, 0.80, 0.80],  // light cyan
        [0.25, 0.50, 0.55],  // deep teal
        [0.50, 0.75, 0.76],  // turquoise
      ],
      // 2: Lodowy biały — prawie monochromatyczny z niebieskim odcieniem
      [
        [0.85, 0.88, 0.92],  // ice white
        [0.72, 0.76, 0.85],  // frosty blue
        [0.90, 0.92, 0.95],  // snow
        [0.65, 0.70, 0.80],  // steel blue
        [0.80, 0.84, 0.90],  // pale ice
        [0.75, 0.78, 0.86],  // light steel
        [0.88, 0.90, 0.94],  // white-blue
        [0.68, 0.72, 0.82],  // cool grey-blue
      ],
      // 3: Głęboki atrament — ciemny niebieski z purpurą
      [
        [0.12, 0.18, 0.42],  // deep indigo
        [0.22, 0.28, 0.55],  // indigo
        [0.08, 0.12, 0.32],  // midnight blue
        [0.32, 0.38, 0.65],  // medium indigo
        [0.15, 0.20, 0.48],  // dark royal
        [0.28, 0.32, 0.58],  // blue-purple
        [0.10, 0.15, 0.38],  // navy-indigo
        [0.35, 0.42, 0.68],  // soft indigo
      ],
      // 4: Turkusowo-szmaragdowy — zielono-niebieski
      [
        [0.15, 0.55, 0.50],  // emerald teal
        [0.25, 0.65, 0.58],  // sea green
        [0.10, 0.42, 0.38],  // dark emerald
        [0.40, 0.75, 0.68],  // light sea
        [0.18, 0.58, 0.52],  // jade
        [0.35, 0.70, 0.62],  // mint teal
        [0.12, 0.48, 0.42],  // deep jade
        [0.30, 0.68, 0.60],  // aquamarine
      ],
      // 5: Lawendowy — fioletowo-niebieski
      [
        [0.45, 0.40, 0.72],  // lavender
        [0.55, 0.50, 0.80],  // light purple
        [0.32, 0.28, 0.60],  // dark lavender
        [0.68, 0.65, 0.88],  // pale lavender
        [0.40, 0.35, 0.68],  // purple blue
        [0.60, 0.55, 0.82],  // wisteria
        [0.28, 0.25, 0.55],  // deep purple-blue
        [0.50, 0.48, 0.75],  // medium lavender
      ],
    ],
  },
};

// ── Vertex shader (identyczny z bake z PlanetShader) ─────────────────────────
const gasVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ── Fragment shader — pasy, turbulencje, burze ───────────────────────────────
const gasFragmentShader = /* glsl */ `
precision highp float;

${GLSL_NOISE_LIB}

uniform vec3 uSeed;
uniform float uBandCount;
uniform sampler2D uBandColors;    // Nx1 DataTexture: kolor każdego pasa
uniform float uTurbulence;
uniform float uPolarDarkening;
uniform int uOutputMode;          // 0=diffuse, 1=normal, 2=roughness
uniform int uStormCount;
// Dane burz: vec4(latCenter, lonCenter, radiusLat, radiusLon) per burza
uniform vec4 uStorm0;
uniform vec4 uStorm1;
uniform vec4 uStorm2;
uniform vec4 uStorm3;
uniform vec4 uStorm4;

varying vec2 vUv;

// Modulo kąta — minimalna odległość kątowa z wrappingiem
float angleDiff(float a, float b) {
  float d = a - b;
  d = mod(d + 3.14159265, 6.28318530) - 3.14159265;
  return d;
}

// Wysokość pasa — do generowania normal map
float bandHeight(float lat, vec3 sp) {
  // Podstawowa sinusoida pasów
  float bandPhase = lat * uBandCount * 3.14159265;
  float h = sin(bandPhase) * 0.5 + 0.5;

  // Turbulencja na krawędziach — Kelvin-Helmholtz
  float edgeNoise = sphereNoise(sp, 4.0) * uTurbulence * 2.0;
  h += edgeNoise * 0.15;

  // Drobny noise wewnątrz pasów
  h += sphereNoise(sp, 12.0) * 0.08;
  h += sphereNoise(sp, 24.0) * 0.04;

  return clamp(h, 0.0, 1.0);
}

// Przetwarzanie burzy — zwraca (mask, swirlColor modifier)
vec2 stormEffect(vec4 stormData, float lat, float lon, vec3 sp) {
  if (stormData.z < 0.001) return vec2(0.0);

  float dLat = (lat - stormData.x) / stormData.z;
  float dLon = angleDiff(lon, stormData.y) / stormData.w;
  float d2 = dLat * dLat + dLon * dLon;

  if (d2 > 1.0) return vec2(0.0);

  float mask = smoothstep(1.0, 0.2, d2);
  // Wir: obrót + noise spiralny
  float angle = atan(dLon, dLat);
  float swirl = sin(angle * 3.0 + sqrt(d2) * 6.0 + sphereNoise(sp, 8.0) * 1.5) * 0.5 + 0.5;
  return vec2(mask, swirl);
}

// sRGB → liniowo (dokładnie sRGBTransferEOTF z three r171).
// ⚠ To NIE jest korekta koloru, tylko PRZENIESIENIE konwersji, którą do dziś
// wykonywał odczyt pikseli: bake pisał paletę SUROWO do RGBA8, a powstała z niej
// CanvasTexture dostawała etykietę SRGBColorSpace — więc GPU dekodował te bajty
// przy próbkowaniu. Bez readbacku cel diffuse ma format SRGB8_ALPHA8 i GPU sam
// koduje zapis liniowo → sRGB, dlatego oddajemy tu kolor LINIOWY: sprzętowe
// kodowanie odtwarza DOKŁADNIE te same bajty co dawny canvas, a próbkowanie tę
// samą wartość liniową. Konwersja stoi na KOŃCU (po wymieszaniu pasów, burz i
// polar darkening) — tam, gdzie dekodował ją stary potok; przeniesienie jej na
// paletę zmieniłoby wynik mieszania. vec3(lessThanEqual(...)), nie mix(...,bvec3)
// — shader zostaje zgodny z GLSL ES 1.0.
vec3 srgbToLinear(vec3 c) {
  return mix(
    pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)),
    c * 0.0773993808,
    vec3(lessThanEqual(c, vec3(0.04045)))
  );
}

void main() {
  // UV → sfera (equirectangular projection)
  float lon = vUv.x * 6.28318530;
  float lat = (1.0 - vUv.y) * 3.14159265;
  vec3 spherePos = vec3(sin(lat) * cos(lon), cos(lat), sin(lat) * sin(lon));
  vec3 sp = spherePos + uSeed;

  // Latitude 0..1 (0 = biegun północny, 1 = biegun południowy)
  float latNorm = 1.0 - vUv.y;
  // Odległość od równika (0 = równik, 1 = bieguny)
  float latFromEquator = abs(latNorm - 0.5) * 2.0;

  // ── DIFFUSE (mode 0) ──────────────────────────────────────────────────────
  if (uOutputMode == 0) {
    // 1. Oblicz indeks pasa z perturbacją noise na krawędziach
    float bandNoise = sphereNoise(sp, 3.0) * uTurbulence
                    + sphereNoise(sp, 7.0) * uTurbulence * 0.5;
    float bandFloat = (latNorm + bandNoise) * uBandCount;
    float bandIdx = floor(bandFloat);
    float bandFrac = fract(bandFloat);

    // 2. Kolor pasa — sample z DataTexture (ostrzejszy blend = widoczniejsze pasy)
    float u0 = (bandIdx + 0.5) / uBandCount;
    float u1 = (bandIdx + 1.5) / uBandCount;
    vec3 c0 = texture2D(uBandColors, vec2(u0, 0.5)).rgb;
    vec3 c1 = texture2D(uBandColors, vec2(u1, 0.5)).rgb;

    // Ostrzejszy blend — widoczne przejścia między pasami jak na Jowiszu
    float edge = smoothstep(0.15, 0.85, bandFrac);
    vec3 color = mix(c0, c1, edge);

    // 3. Within-band FBM variation (subtelna modulacja koloru wewnątrz pasa)
    // Rozciągnięte horyzontalnie — symulacja wiatrów równoleżnikowych
    vec3 spStretched = sp * vec3(0.25, 1.0, 0.25);
    float fbm = sphereNoise(spStretched, 6.0)  * 0.50
              + sphereNoise(spStretched, 12.0) * 0.25
              + sphereNoise(spStretched, 24.0) * 0.125;
    fbm = fbm * 0.5 + 0.5;  // 0..1
    color *= (0.90 + fbm * 0.20);

    // 4. Zonal flow — podłużne rozciąganie (wiatr równoleżnikowy)
    vec3 spZonal = sp * vec3(0.15, 1.0, 0.15);
    float zonalNoise = sphereNoise(spZonal, 4.0) * 0.06;
    color *= (1.0 + zonalNoise);

    // 5. Burze — overlay wirów
    vec2 s;
    s = stormEffect(uStorm0, latNorm, lon, sp);
    if (s.x > 0.0) color = mix(color, mix(color * 0.7, color * 1.4, s.y), s.x * 0.7);
    s = stormEffect(uStorm1, latNorm, lon, sp);
    if (s.x > 0.0) color = mix(color, mix(color * 0.7, color * 1.4, s.y), s.x * 0.7);
    s = stormEffect(uStorm2, latNorm, lon, sp);
    if (s.x > 0.0) color = mix(color, mix(color * 0.7, color * 1.4, s.y), s.x * 0.7);
    s = stormEffect(uStorm3, latNorm, lon, sp);
    if (s.x > 0.0) color = mix(color, mix(color * 0.7, color * 1.4, s.y), s.x * 0.7);
    s = stormEffect(uStorm4, latNorm, lon, sp);
    if (s.x > 0.0) color = mix(color, mix(color * 0.7, color * 1.4, s.y), s.x * 0.7);

    // 6. Polar darkening
    float polarMask = smoothstep(0.6, 1.0, latFromEquator);
    color *= (1.0 - polarMask * uPolarDarkening);

    // Cel diffuse jest SRGB8_ALPHA8 — GPU zakoduje zapis, więc oddajemy liniowo.
    gl_FragColor = vec4(srgbToLinear(color), 1.0);
  }

  // ── NORMAL MAP (mode 1) ────────────────────────────────────────────────────
  // Gazowe giganty to chmury — bardzo subtelny bump, prawie płaski
  else if (uOutputMode == 1) {
    float eps = 0.003;
    float h0 = bandHeight(latNorm, sp);

    vec3 spDx = vec3(sin(lat) * cos(lon + eps), cos(lat), sin(lat) * sin(lon + eps)) + uSeed;
    vec3 spDy = vec3(sin(lat - eps) * cos(lon), cos(lat - eps), sin(lat - eps) * sin(lon)) + uSeed;
    float hDx = bandHeight(latNorm, spDx);
    float hDy = bandHeight(latNorm + eps * 0.5, spDy);

    float dHdx = (hDx - h0) / eps;
    float dHdy = (hDy - h0) / eps;
    // Bardzo niski bump — chmury, nie skaliste podłoże
    float bumpScale = 0.04;
    vec3 normal = normalize(vec3(-dHdx * bumpScale, -dHdy * bumpScale, 1.0));

    gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
  }

  // ── ROUGHNESS MAP (mode 2) ─────────────────────────────────────────────────
  // Chmury gazowego giganta — gładkie, niska roughness (chmury odbijają światło)
  else {
    float h = bandHeight(latNorm, sp);
    // Bazowa roughness: niższa = gładsze, chmurne szczyty
    float roughness = 0.35 + h * 0.15;

    // Burze — jeszcze gładsze (wyższe, bardziej refleksyjne chmury)
    vec2 s;
    s = stormEffect(uStorm0, latNorm, lon, sp);
    roughness -= s.x * 0.10;
    s = stormEffect(uStorm1, latNorm, lon, sp);
    roughness -= s.x * 0.10;
    s = stormEffect(uStorm2, latNorm, lon, sp);
    roughness -= s.x * 0.10;

    // Krawędzie pasów — lekko szorstsze (turbulencja)
    float edgeNoise = abs(sphereNoise(sp, 6.0));
    roughness += edgeNoise * uTurbulence * 0.3;

    gl_FragColor = vec4(vec3(clamp(roughness, 0.25, 0.65)), 1.0);
  }
}
`;

// ── Tworzenie uniformów dla bake ─────────────────────────────────────────────
function createGasBakeUniforms(planet) {
  const seed = hashCode(String(planet.id));
  const rng = mulberry32(seed);

  // Rozpoznaj pod-typ
  const texType = resolveTextureType(planet);
  const presetKey = (texType === 'gas_warm' || texType === 'gas_cold') ? texType : 'gas_giant';
  const preset = GAS_PRESETS[presetKey];

  // Parametry deterministyczne
  const bandCount = Math.round(rngRange(rng, preset.bandCount[0], preset.bandCount[1]));
  const turbulence = rngRange(rng, preset.turbulence[0], preset.turbulence[1]);
  const polarDark = rngRange(rng, preset.polarDark[0], preset.polarDark[1]);

  const seedVec = new THREE.Vector3(
    rngRange(rng, -50, 50),
    rngRange(rng, -50, 50),
    rngRange(rng, -50, 50),
  );

  // Losuj paletę z tablicy palet (deterministycznie z seeda)
  const palette = preset.palettes[Math.floor(rng() * preset.palettes.length)];

  // Paleta pasów → DataTexture (bandCount × 1, RGBA)
  const bandData = new Uint8Array(bandCount * 4);
  for (let i = 0; i < bandCount; i++) {
    const palIdx = Math.floor(rng() * palette.length);
    const col = palette[palIdx];
    // Jitter per-band: ±10% na każdym kanale
    const jR = 0.9 + rng() * 0.2;
    const jG = 0.9 + rng() * 0.2;
    const jB = 0.9 + rng() * 0.2;
    bandData[i * 4 + 0] = Math.round(Math.min(255, col[0] * jR * 255));
    bandData[i * 4 + 1] = Math.round(Math.min(255, col[1] * jG * 255));
    bandData[i * 4 + 2] = Math.round(Math.min(255, col[2] * jB * 255));
    bandData[i * 4 + 3] = 255;
  }
  const bandColorsTex = new THREE.DataTexture(bandData, bandCount, 1, THREE.RGBAFormat);
  bandColorsTex.magFilter = THREE.LinearFilter;
  bandColorsTex.minFilter = THREE.LinearFilter;
  bandColorsTex.wrapS = THREE.RepeatWrapping;
  bandColorsTex.needsUpdate = true;

  // Burze — deterministyczne pozycje i rozmiary
  const storms = [];
  for (let i = 0; i < preset.stormMax; i++) {
    if (rng() > preset.stormProb) {
      storms.push(new THREE.Vector4(0, 0, 0, 0)); // brak burzy
      continue;
    }
    const stormLat = 0.2 + rng() * 0.6;             // 20–80% latitude (unika biegunów)
    const stormLon = rng() * 6.28318530;             // dowolna longitude
    const rLat = 0.02 + rng() * 0.06;               // promień latitude
    const rLon = rLat * (1.5 + rng() * 1.5);        // promień longitude (rozciągnięte)
    storms.push(new THREE.Vector4(stormLat, stormLon, rLat, rLon));
  }
  // Dopełnij do 5 pustymi
  while (storms.length < 5) storms.push(new THREE.Vector4(0, 0, 0, 0));

  return {
    uSeed:           { value: seedVec },
    uBandCount:      { value: bandCount },
    uBandColors:     { value: bandColorsTex },
    uTurbulence:     { value: turbulence },
    uPolarDarkening: { value: polarDark },
    uOutputMode:     { value: 0 },
    uStormCount:     { value: storms.filter(s => s.z > 0).length },
    uStorm0:         { value: storms[0] },
    uStorm1:         { value: storms[1] },
    uStorm2:         { value: storms[2] },
    uStorm3:         { value: storms[3] },
    uStorm4:         { value: storms[4] },
  };
}

// ── Współdzielony materiał bake'u (Finding 251) ──────────────────────────────
// ⚠ Materiał i geometria BYŁY tworzone i zwalniane PER PRZEBIEG. material.dispose()
// woła releaseShaderCache → WebGLShaderCache.remove() zbija usedTimes do zera i KASUJE
// wpis etapu shadera, więc następny materiał z tym samym źródłem dostawał NOWY id etapu
// → nowy programCacheKey → PEŁNA rekompilacja w ANGLE. Zmierzone (RTX 3070, D3D11):
// 269,7 ms/mapę z dispose vs 0,10 ms/mapę przy reżyciu — a kontrola „nowy materiał,
// ale BEZ dispose" też 0,10 ms, więc winowajcą jest dispose, nie konstrukcja.
// Materiał NIE trzyma stanu renderera (zasoby GPU siedzą w WebGLProperties per
// renderer), więc wolno go dzielić między ThreeRenderer i PlanetGlobeRenderer — każdy
// kontekst kompiluje program u siebie raz.
// ⚠ NIE ZWALNIAĆ go w żadnym teardownie per planeta / per renderer: jedno dispose
// przywraca dokładnie ten koszt, który ten blok usuwa.
let _bakeMaterial = null;
let _bakeScene    = null;
let _bakeCam      = null;

// Pierwsze wywołanie ADOPTUJE obiekt uniformów pierwszego gazowca; kolejne PRZEPISUJĄ
// do niego wartości. Referencja musi być stabilna — three czyta
// materialProperties.uniforms przy każdym uploadzie, a podmiana obiektu wymagałaby
// material.needsUpdate, czyli przebudowy programu. Zbiory kluczy są identyczne
// z konstrukcji: oba pochodzą z createGasBakeUniforms (literał o stałym kształcie).
function _ensureBakeContext(uniforms) {
  if (!_bakeMaterial) {
    _bakeMaterial = new THREE.ShaderMaterial({
      vertexShader:   gasVertexShader,
      fragmentShader: gasFragmentShader,
      uniforms,
    });
    _bakeScene = new THREE.Scene();
    _bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _bakeMaterial));
    _bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return;
  }
  const target = _bakeMaterial.uniforms;
  for (const key in uniforms) {
    if (target[key]) target[key].value = uniforms[key].value;
  }
}

// Paleta pasów to DataTexture PER PLANETA — zwalniana po bake'u jak dotąd. Przy
// współdzielonym materiale trzeba jeszcze ODPIĄĆ referencję, żeby w uniformach nie
// została zwolniona tekstura.
function _releasePalette(uniforms) {
  const tex = uniforms?.uBandColors?.value;
  if (tex) { try { tex.dispose(); } catch (e) { /* kontekst mógł paść */ } }
  if (_bakeMaterial && _bakeMaterial.uniforms.uBandColors?.value === tex) {
    _bakeMaterial.uniforms.uBandColors.value = null;
  }
}

// ── RTT bake — renderuje jedną mapę (diffuse/normal/roughness) ───────────────
// Zwraca WebGLRenderTarget — jego .texture idzie PROSTO na materiał. Dawna ścieżka
// czytała cel przez readRenderTargetPixels (2 MiB synchronicznego stalla GPU→CPU na
// mapę, czyli 9 stalli / 18 MiB na układ z trzema gazowcami) tylko po to, by przelać
// bajty do canvasu i zrobić z niego CanvasTexture.
// ⚠ Parametry próbkowania MUSZĄ stać w opcjach celu: three czyta je RAZ, w
// setupRenderTarget (setTextureParameters + setupFrameBufferTexture) przy pierwszym
// setRenderTarget — późniejsza zmiana nie przealokuje już tekstury.
function _renderBakePass(renderer, outputMode, w, h) {
  _bakeMaterial.uniforms.uOutputMode.value = outputMode;

  const isDiffuse = (outputMode === 0);
  const rt = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type:   THREE.UnsignedByteType,
    // Lustro etykiet dawnej CanvasTexture: diffuse → sRGB, normal/roughness →
    // linear. Dla diffuse daje to załącznik SRGB8_ALPHA8, czyli sprzętowe
    // dekodowanie przy próbkowaniu — dokładnie to, co robiła CanvasTexture
    // (po stronie zapisu odpowiada mu srgbToLinear w gasFragmentShader).
    colorSpace: isDiffuse ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace,
    // CanvasTexture miała mipmapy z domyślnych ustawień Texture; render target ich
    // NIE ma (generateMipmaps:false, minFilter:LinearFilter), a bez nich pasy
    // gazowca migotałyby z odległości. 1024×512 = POT, mipmapy legalne.
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    // Jak commit 420d00f dla CanvasTexture — pasy biegną równoleżnikowo, więc przy
    // biegunach i na krawędzi tarczy patrzymy na nie pod bardzo ostrym kątem.
    anisotropy: resolveMaxAnisotropy(renderer),
    // Bake to fullscreen quad — głębia zbędna, a cel żyje teraz tak długo jak
    // tekstura, więc renderbuffer głębi (2 MiB/mapę) zostawałby na stałe.
    depthBuffer:   false,
    stencilBuffer: false,
  });

  renderer.setRenderTarget(rt);
  renderer.render(_bakeScene, _bakeCam);   // mipmapy generuje samo render() (updateRenderTargetMipmap)
  renderer.setRenderTarget(null);

  // Materiał, geometria i scena ZOSTAJą (współdzielone — patrz Finding 251 wyżej).
  // Cel też ZOSTAJE: trzyma go cache, zwalnia disposeGasTexturesFor.
  return rt;
}

// ── Publiczna funkcja bake — cache per renderer → planet.id ──────────────────
// Zwraca { diffuse, normal, roughness } jako tekstury render-targetów
function bakeGasGiantTextures(planet, renderer) {
  if (!renderer) return null;

  let perRenderer = _gasTextureCache.get(renderer);
  if (!perRenderer) {
    perRenderer = new Map();
    _gasTextureCache.set(renderer, perRenderer);
  }

  const cacheKey = `gas_${planet.id}`;
  if (perRenderer.has(cacheKey)) return perRenderer.get(cacheKey);

  const BAKE_W = 1024, BAKE_H = 512;
  const uniforms = createGasBakeUniforms(planet);
  _ensureBakeContext(uniforms);

  // ⚠ _renderBakePass NIE zwalnia już swojego celu, więc do chwili wpisania go do
  // wyniku jedyną referencją jest ta tablica. Bez niej wyjątek w drugim albo trzecim
  // przebiegu zostawiałby 1-2 FBO bez właściciela (dawniej każdy przebieg sprzątał
  // po sobie sam, więc rzut niczego nie zostawiał po stronie GPU).
  const targets = [];
  try {
    targets.push(_renderBakePass(renderer, 0, BAKE_W, BAKE_H));   // diffuse
    targets.push(_renderBakePass(renderer, 1, BAKE_W, BAKE_H));   // normal
    targets.push(_renderBakePass(renderer, 2, BAKE_W, BAKE_H));   // roughness
  } catch (err) {
    for (const rt of targets) { try { rt.dispose(); } catch (e) { /* kontekst mógł paść */ } }
    _releasePalette(uniforms);
    throw err;
  }

  // Cleanup DataTexture palety (+ odpięcie jej od współdzielonego materiału)
  _releasePalette(uniforms);

  const result = {
    diffuse:   targets[0].texture,
    normal:    targets[1].texture,
    roughness: targets[2].texture,
    // Cele trzymamy przy wyniku — tekstura nie ma publicznej drogi powrotnej do
    // swojego render targetu, a to on jest właścicielem FBO do zwolnienia.
    _targets:  targets,
  };
  perRenderer.set(cacheKey, result);

  return result;
}

// ── Zwolnienie celów bake'u należących do DANEGO renderera ───────────────────
// Wołane z teardownu, który niszczy kontekst GL (PlanetGlobeRenderer.close) i po
// odzyskaniu kontekstu w ThreeRenderer. Bez tego wpisy i tak odeszłyby razem z
// rendererem (WeakMap), ale jawne zwolnienie zdejmuje FBO od razu — i, co
// ważniejsze, USUWA wpis, więc następny bake nie odda tekstury z martwego
// kontekstu. Zwraca liczbę zwolnionych celów (diagnostyka).
function disposeGasTexturesFor(renderer) {
  const perRenderer = renderer && _gasTextureCache.get(renderer);
  if (!perRenderer) return 0;

  let freed = 0;
  for (const entry of perRenderer.values()) {
    for (const rt of (entry?._targets || [])) {
      try { rt.dispose(); freed++; } catch (e) { /* kontekst mógł już paść */ }
    }
  }
  perRenderer.clear();
  _gasTextureCache.delete(renderer);
  return freed;
}

export const GasGiantShader = {
  gasVertexShader,
  gasFragmentShader,
  createGasBakeUniforms,
  bakeGasGiantTextures,
  disposeGasTexturesFor,
  GAS_PRESETS,
};
