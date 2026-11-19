// SurfaceShader — JEDEN wspólny shader powierzchni ciał (ARC COLONY SPHERE, krok CS-6a; plan §2, §3.6).
//
// Wejście: mapa RGBA8 z SurfaceCache (kanały e, m, t, a — SurfaceField.bakeEquirect), paleta 8 barw archetypu
// (SurfacePaletteLogic.resolveSurfaceLook), poziom morza, kierunek i barwa słońca. Wyjście: oświetlona powierzchnia —
// normalne z gradientu wysokości + drobny szum w przestrzeni obiektu, oceany z głębią / odblaskiem / płyciznami, jasny
// lód, żar lawy po nocnej stronie, miękki terminator, ciemna noc, slot świateł miast (`uCityLights`, czarny do CS-9).
//
// Konsumenci: mapa układu (ThreeRenderer, za FEATURES.sharedSurface) i — od CS-7 — ColonySphereRenderer.
//
// ⚠ Moduł ma ZERO importów three (wzór FxShaders / LogDepthChunks): THREE jest wstrzykiwane do fabryk, więc teksty
//   programów czyta keeper pod node, a arkusz kontaktowy i sonda kompilacji ładują ten sam plik w przeglądarce.
// ⚠ GLSL: wartości per ciało WYŁĄCZNIE przez uniformy (wspólny cache programów three) — żadnej interpolacji stringów;
//   w literałach GLSL nie ma odwrotnych apostrofów. Mapowanie equirect liczone per fragment z kierunku w przestrzeni
//   obiektu (bez UV siatki) + jawny LOD (`textureLod`) — bez szwu na południku ±180° i bez ściągnięcia na biegunach.
// ⚠ Znaczenie progów w funkcjach wyglądu = klasyfikatory SurfaceField (cTerran, cDesert, …): to, co gracz widzi na
//   mapie układu, zgadza się z terenem kafli (CS-5). Zmiana progu tam → zmiana tutaj.

import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';

/** Udział barwy gwiazdy w świetle padającym na powierzchnię (0 = białe światło, 1 = barwa gwiazdy wprost). Gwiazda M
 *  ma w grze barwę 0xff6b47 — przy pełnej barwie każda powierzchnia byłaby monochromatycznie czerwona, a oceany czarne. */
export const SURFACE_SUN_TINT = 0.4;

/** Mapa bohatera (1024×512) na zbliżeniu: wejście / wyjście wg średnicy tarczy ciała na ekranie [px urządzenia].
 *  Mapa LOD 256×128 ma ≈ 1 teksel / px przy tarczy ≈ 80 px; histereza chroni przed migotaniem na granicy. */
export const SURFACE_HERO_PX = Object.freeze({ enter: 260, exit: 180, steal: 1.4 });

/**
 * Które ciało ma dostać mapę bohatera (czyste; jedno ciało na raz). `currentPx` = średnica tarczy obecnego bohatera
 * (0 = brak), `bestPx` = największa tarcza w kadrze. Obecny zostaje, dopóki nie spadnie pod `exit` albo inne ciało nie
 * jest wyraźnie większe (`steal` ×).
 * @returns {'keep'|'best'|'none'}
 */
export function surfaceHeroDecision(currentPx, bestPx, bestIsCurrent = false) {
  const T = SURFACE_HERO_PX;
  const keep = currentPx >= T.exit;
  const want = bestPx >= T.enter;
  if (bestIsCurrent) return keep ? 'keep' : 'none';
  if (keep && !(want && bestPx > currentPx * T.steal)) return 'keep';
  return want ? 'best' : 'none';
}

/**
 * Światło DOPEŁNIAJĄCE gwiazdy (decyzja właściciela 2026-11-18, „b"): jeden wspólny, zmiękczony odcień gwiazdy dla
 * WSZYSTKICH ciał. Surowy PointLight (barwa gwiazdy wprost) + to dopełnienie = dokładnie `surfaceSunColor` — gazowce
 * (GasGiantShader nietknięty, D-CS-5) i skały dostają tę samą barwę światła. Zwraca barwę dopełnienia (≥ 0) przy tej
 * samej intensywności co PointLight gwiazdy.
 */
export function surfaceFillLightColor(r, g, b, out = [0, 0, 0]) {
  const mx = Math.max(r, g, b, 1e-6), k = SURFACE_SUN_TINT;
  out[0] = Math.max(0, 1 + (r / mx - 1) * k - r); out[1] = Math.max(0, 1 + (g / mx - 1) * k - g); out[2] = Math.max(0, 1 + (b / mx - 1) * k - b);
  return out;
}

/** Czas przejścia barwa zastępcza → mapa [s]. */
export const SURFACE_FADE_SECONDS = 0.35;

/**
 * Uniformy WSPÓLNE wszystkich materiałów mapy układu (jeden obiekt na uniform — three czyta `.value` co klatkę).
 * `uTune` = pokrętła strojenia na żywo: [relief ×, połysk ×, żar ×, detal ×].
 */
export const SURFACE_SHARED_UNIFORMS = {
  uSunPos:   { value: [0, 0, 0] },
  uSunColor: { value: [0.89, 0.86, 0.80] },
  uAmbient:  { value: [0.002, 0.004, 0.008] },
  uTune:     { value: [1, 1, 1, 1] },
};

/**
 * Barwa słońca dla shadera z liniowej barwy i intensywności PointLighta gwiazdy: odcień gwiazdy znormalizowany do
 * najjaśniejszego kanału i zmieszany z bielą (SURFACE_SUN_TINT) oraz podział przez π (BRDF Lamberta — ta sama skala co MeshStandardMaterial).
 */
export function surfaceSunColor(r, g, b, intensity, out = [0, 0, 0]) {
  const mx = Math.max(r, g, b, 1e-6), k = SURFACE_SUN_TINT, s = intensity / Math.PI;
  out[0] = (1 + (r / mx - 1) * k) * s; out[1] = (1 + (g / mx - 1) * k) * s; out[2] = (1 + (b / mx - 1) * k) * s;
  return out;
}

export const SURFACE_VERT = /* glsl */`
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vWx;
varying vec3 vWy;
varying vec3 vWz;

void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vWx = normalize(modelMatrix[0].xyz);
  vWy = normalize(modelMatrix[1].xyz);
  vWz = normalize(modelMatrix[2].xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SURFACE_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform sampler2D uCityLights;
uniform vec2 uMapSize;
uniform float uMapMix;
uniform float uCityGain;
uniform int uLook;
uniform vec3 uPal[8];
uniform vec3 uPlaceholder;
uniform vec4 uA;
uniform vec4 uB;
uniform vec4 uC;
uniform vec3 uSunPos;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec4 uTune;

varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vWx;
varying vec3 vWy;
varying vec3 vWz;

// uA = (poziom morza, próg czapy polarnej, tryb, próg m) · uB = (próg e, znak progu e, relief, połysk)
// uC = (żar, miękkość terminatora, faza szumu, —)
#define P0 uPal[0]
#define P1 uPal[1]
#define P2 uPal[2]
#define P3 uPal[3]
#define P4 uPal[4]
#define P5 uPal[5]
#define P6 uPal[6]
#define P7 uPal[7]

float gWater;
float gIce;
float gGlow;
vec3 gGlowCol;
float gE0;
float gNa;
float gNb;

// Minimalne albedo (liniowe) — ciemne regiony nie zapadają się w czerń; pod słabą gwiazdą próg rośnie (do 2.5 ×).
const float ALB_FLOOR = 0.03;

float ss(float a, float b, float x) { return smoothstep(a, b, x); }

float h31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p) {
  float s = vnoise(p) * 0.5;
  p = p.yzx * 2.03 + 17.13;
  s += vnoise(p) * 0.25;
  p = p.yzx * 2.01 + 5.71;
  s += vnoise(p) * 0.125;
  return s / 0.875;
}

vec2 dirToUv(vec3 d) {
  return vec2(atan(d.z, d.x) * 0.15915494 + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) * 0.31830989);
}

// Cieniowanie krateru z kanału a (0.5 = brak, < 0.5 dno, > 0.5 wał).
vec3 craterShade(vec3 c, float a, float k) { return c * (1.0 + (a - 0.5) * k); }

// terran / ocean / jungle — progi jak cTerran / cOcean / cJungle.
// ⚠ Dwa świadome odstępstwa od klasyfikatora (strojenie CS-6a, plan §3.6.1): kanał e pola nasyca się na 1.0, więc
//   przy dużym pokryciu wodą większość lądu ma h ≈ 1 (klasy mountains / peaks). Na mapie układu góry są więc
//   porośnięte (ciemniejsza roślinność), a goła skała wychodzi tylko tam, gdzie sucho albo na grzbietach szumu;
//   śnieg szczytów wymaga dodatkowo chłodu (t), nie samej wysokości.
vec3 lookTerran(float e, float m, float t, float a) {
  float sea = uA.x, capT = uA.y, mode = uA.z;
  float h = clamp((e - sea) / max(1.0 - sea, 0.001), 0.0, 1.0);
  vec3 c;
  float iceLand = 0.0;
  float mt;
  float patchK = 0.30;
  if (mode > 1.5) {
    c = mix(P3, P4, ss(0.30, 0.42, m));
    c = mix(c, P7, ss(0.62, 0.72, m) * (1.0 - ss(0.10, 0.18, h)));
    mt = ss(0.52, 0.66, h);
    patchK = 0.12;
  } else if (mode > 0.5) {
    c = mix(P3, P4, ss(0.42, 0.58, m));
    mt = ss(0.36, 0.52, h);
  } else {
    c = mix(P2, P3, ss(0.27, 0.39, m));
    c = mix(c, P4, ss(0.52, 0.66, m));
    c = mix(c, P7, 1.0 - ss(capT + 0.08, capT + 0.20, t));
    mt = ss(0.48, 0.62, h);
    iceLand = ss(0.0, 0.06, h - (0.45 + 0.7 * t)) * (1.0 - ss(0.34, 0.52, t)) * ss(0.30, 0.55, gNa);
  }
  // Płaty suchszej roślinności (szum) — ląd nie jest jedną plamą farby.
  c = mix(c, mix(c, P2, 0.55), ss(0.56, 0.82, gNb) * patchK);
  // Góry: ciemniejsza roślinność regla; goła skała tylko gdzie sucho / na grzbietach.
  float bare = mt * clamp(0.08 + 0.62 * (1.0 - ss(0.28, 0.60, m)) + (gNa - 0.5) * 0.8, 0.0, 0.72);
  c *= 1.0 - 0.18 * mt;
  c = mix(c, P5, bare);
  // Plaża: wąski, niejaskrawy pas tuż nad wodą.
  c = mix(c, mix(P2, vec3(0.8), 0.12), (1.0 - ss(0.0, 0.012, h)) * 0.22);
  iceLand = max(iceLand, 1.0 - ss(capT - 0.018, capT + 0.018, t));
  c = mix(c, P6, iceLand);

  // Ocean: ciemna toń z łagodnym gradientem głębi; płycizna tylko wąskim pasem szelfu przy brzegu.
  float depth = clamp((sea - e) / 0.30, 0.0, 1.0);
  vec3 sc = P0 * mix(2.3, 1.35, ss(0.03, 0.85, depth));
  sc = mix(sc, P1 * 1.25, (1.0 - ss(0.0, 0.07, depth)) * 0.60);
  float pack = 1.0 - ss(capT - 0.058, capT - 0.022, t);
  sc = mix(sc, P6 * 0.95, pack);

  float water = 1.0 - ss(sea - 0.004, sea + 0.004, e);
  gWater = water * (1.0 - pack);
  gIce = mix(iceLand, pack, water);
  return mix(c, sc, water);
}

// desert (Mars) — cDesert.
vec3 lookDesert(float e, float m, float t, float a) {
  vec3 c = mix(P1, P0, ss(0.22, 0.38, m));
  c = mix(c, P3, (1.0 - ss(0.24, 0.34, e)) * ss(0.44, 0.56, m));
  c = mix(c, P2, ss(0.66, 0.78, e));
  c *= 0.88 + 0.24 * e;
  c = craterShade(c, a, 0.7);
  float frost = 1.0 - ss(uA.y - 0.025, uA.y + 0.025, t);
  gIce = frost;
  return mix(c, P4, frost);
}

// ice — cIce.
vec3 lookIce(float e, float m, float t, float a) {
  vec3 c = mix(P1, P0, ss(0.28, 0.42, m));
  c = mix(c, P2, ss(0.56, 0.68, m));
  float rock = ss(0.84, 0.94, m) * ss(0.28, 0.42, t);
  c = mix(c, P3, rock);
  c = mix(c, mix(P4, P6, ss(0.48, 0.62, m)), ss(0.68, 0.80, e));
  c *= 0.92 + 0.14 * e;
  float rift = ss(0.66, 0.80, a);
  c = mix(c, P5, rift);
  gIce = (1.0 - rock) * (1.0 - 0.6 * rift);
  return c;
}

// volcanic — cVolcanic; m = maska lawy.
vec3 lookVolcanic(float e, float m, float t, float a) {
  vec3 c = mix(P0, P1, ss(0.22, 0.34, m));
  c = mix(c, P2, ss(0.64, 0.76, e));
  c *= 0.85 + 0.3 * e;
  float cal = 1.0 - ss(0.30, 0.42, a);
  c = mix(c, P4, cal);
  float lava = ss(0.50, 0.66, m);
  float hot = ss(0.64, 0.98, m);
  c = mix(c, P3 * 0.22, lava);
  gGlow = lava * (0.30 + 1.5 * hot) + cal * 0.10;
  gGlowCol = mix(P3, P5, hot);
  return c;
}

// hothouse (Wenus bez chmur) — cHothouse.
vec3 lookHothouse(float e, float m, float t, float a) {
  vec3 c = mix(P1, P0, ss(0.28, 0.40, e));
  c = mix(c, P4, ss(0.35, 0.75, m) * 0.65);
  c = mix(c, P2, ss(0.66, 0.78, e));
  c *= 0.88 + 0.22 * e;
  return mix(c, P3, ss(0.62, 0.76, a));
}

// cryo_haze / hazy_moon (Tytan) — cCryoHaze / cHazyMoon.
vec3 lookCryo(float e, float m, float t, float a) {
  float sea = uA.x;
  vec3 c = mix(P0, P4, ss(0.62, 0.76, m));
  c = mix(c, P3, ss(0.68, 0.82, t) * (1.0 - ss(0.48, 0.62, m)));
  c = mix(c, uA.z > 0.5 ? P4 : P2, ss(0.68, 0.80, e));
  c *= 0.88 + 0.24 * e;
  c = craterShade(c, a, 0.6);
  // Jeziora metanu: brzeg z SUROWEGO kanału e (bez szumu detalu — szum strzępił linię brzegową w czarne zęby),
  // szeroki miękki próg, jaśniejsza płycizna; barwa ciemna, ale nie czarna.
  float dep = sea - gE0;
  float water = ss(-0.012, 0.012, dep);
  vec3 lake = mix(mix(c, P1, 0.62), P1, ss(0.0, 0.05, dep));
  gWater = water;
  return mix(c, lake, water);
}

// scorched / barren / rocky_cratered / icy_cratered / planetoid* — cScorched … cPlanetoidIcy.
vec3 lookCratered(float e, float m, float t, float a) {
  vec3 c = mix(P0, P1, ss(uA.w - 0.05, uA.w + 0.05, m));
  float ef = uB.y > 0.5 ? ss(uB.x - 0.04, uB.x + 0.04, e) : (uB.y < -0.5 ? 1.0 - ss(uB.x - 0.04, uB.x + 0.04, e) : 0.0);
  c = mix(c, P4, ef);
  c *= 0.84 + 0.30 * e;
  float fl = 1.0 - ss(0.33, 0.43, a);
  c = mix(c, P2, fl * 0.85);
  c = mix(c, P3, ss(0.58, 0.72, a) * 0.9);
  float pi = fl * (1.0 - ss(uA.y - 0.02, uA.y + 0.02, t));
  gIce = pi;
  return mix(c, P5, pi);
}

// tidally_locked (gałka oczna) — cTidal; t = oświetlenie (punkt podgwiezdny = +x pola).
vec3 lookTidal(float e, float m, float t, float a) {
  vec3 c = mix(P4, P2, ss(0.34, 0.46, t));
  float seaM = ss(0.66, 0.78, m) * ss(0.38, 0.44, t) * (1.0 - ss(0.56, 0.62, t));
  c = mix(c, P1, ss(0.54, 0.66, t));
  c = mix(c, P0, ss(0.88, 0.97, t));
  c *= 0.86 + 0.28 * e;
  c = craterShade(c, a, 0.5);
  gWater = seaM;
  gIce = (1.0 - ss(0.34, 0.46, t)) * (1.0 - seaM);
  return mix(c, P3, seaM);
}

// volcanic_moon (Io) — cIo; a = patera (rdzeń = jezioro lawy).
vec3 lookIo(float e, float m, float t, float a) {
  vec3 c = mix(P0, P1, ss(0.32, 0.68, m));
  c = mix(c, P5, ss(0.76, 0.92, m) * 0.7);
  c = mix(c, P2, ss(0.66, 0.78, e));
  c *= 0.88 + 0.22 * e;
  float pat = ss(0.56, 0.68, a);
  c = mix(c, P3, pat);
  float lake = ss(0.76, 0.88, a);
  c = mix(c, P4 * 0.2, lake);
  gGlow = lake * 1.5 + pat * 0.06;
  gGlowCol = mix(P4, vec3(1.0, 0.82, 0.45), ss(0.86, 0.99, a));
  return c;
}

// icy_cracked (Europa) — cEuropa; m = maska lineae.
vec3 lookEuropa(float e, float m, float t, float a) {
  vec3 c = mix(P0, P1, ss(0.50, 0.60, e));
  c = mix(c, P2, ss(0.61, 0.71, e));
  c *= 0.92 + 0.14 * e;
  c = craterShade(c, a, 0.5);
  float lin = ss(0.28, 0.62, m);
  gIce = 1.0 - 0.6 * lin;
  return mix(c, P3, lin);
}

void main() {
  vec3 d = normalize(vObj);
  float fw = max(length(dFdx(d)), length(dFdy(d)));
  float lod = max(0.0, log2(fw * uMapSize.x * 0.15915494 + 0.000001));
  vec2 uv = dirToUv(d);
  vec4 s = textureLod(uMap, uv, lod);

  // Drobny szum w przestrzeni obiektu: postrzępia granice biomów poniżej rozdzielczości mapy i niesie zbliżenie.
  // Wygaszany, gdy element szumu schodzi poniżej ~2 px (bez migotania na małych ciałach).
  float dFade = (1.0 - smoothstep(0.006, 0.02, fw)) * uTune.w;
  float mFade = (1.0 - smoothstep(0.0015, 0.005, fw)) * uTune.w;
  vec3 q = d * 38.0 + uC.z;
  float n1 = fbm3(q);
  float n2 = vnoise(q * 0.6 + 41.3);
  float n3 = vnoise(d * 150.0 + uC.z);
  float hFade = (1.0 - smoothstep(0.0005, 0.0017, fw)) * uTune.w;
  float n4 = vnoise(d * 460.0 + uC.z);
  gE0 = s.r;
  gNa = n1;
  gNb = n2;
  float e = s.r + (n1 - 0.5) * 0.045 * dFade;
  float m = s.g + (n2 - 0.5) * 0.11 * dFade;
  float t = s.b + (n1 - 0.5) * 0.02 * dFade;
  float a = s.a;

  gWater = 0.0;
  gIce = 0.0;
  gGlow = 0.0;
  gGlowCol = vec3(0.0);
  vec3 alb;
  if (uLook == 0) alb = lookTerran(e, m, t, a);
  else if (uLook == 1) alb = lookDesert(e, m, t, a);
  else if (uLook == 2) alb = lookIce(e, m, t, a);
  else if (uLook == 3) alb = lookVolcanic(e, m, t, a);
  else if (uLook == 4) alb = lookHothouse(e, m, t, a);
  else if (uLook == 5) alb = lookCryo(e, m, t, a);
  else if (uLook == 6) alb = lookCratered(e, m, t, a);
  else if (uLook == 7) alb = lookTidal(e, m, t, a);
  else if (uLook == 8) alb = lookIo(e, m, t, a);
  else alb = lookEuropa(e, m, t, a);

  alb *= 1.0 + ((n1 - 0.5) * 0.26 * dFade + (n3 - 0.5) * 0.15 * mFade + (n4 - 0.5) * 0.13 * hFade) * (1.0 - gWater);

  // Minimalne albedo: miękki próg luminancji (zachowuje odcień), mocniejszy pod słabą gwiazdą, słabszy na toni.
  float sunL = max(max(uSunColor.r, uSunColor.g), uSunColor.b);
  float weak = clamp(0.89 / max(sunL, 0.05) - 1.0, 0.0, 1.0);
  alb *= 1.0 + 0.4 * weak;
  float fl = ALB_FLOOR * clamp(0.89 / max(sunL, 0.05), 1.0, 2.5) * (1.0 - 0.4 * gWater);
  vec3 albB = alb + vec3(0.0015);
  float lum = dot(albB, vec3(0.2126, 0.7152, 0.0722));
  alb = albB * ((lum + fl * exp(-lum / fl)) / lum);

  // Barwa zastępcza do czasu nadejścia mapy (uMapMix 0 → 1).
  alb = mix(uPlaceholder, alb, uMapMix);
  gWater *= uMapMix;
  gIce *= uMapMix;
  gGlow *= uMapMix;

  // Normalna: gradient wysokości z mapy (różnice centralne w kierunkach wschód / północ) + gradient szumu.
  vec3 up = abs(d.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 te = normalize(cross(up, d));
  vec3 tn = cross(d, te);
  float eps = max(7.854 / uMapSize.x, fw * 1.5);
  float sea = uA.x;
  float hE = max(textureLod(uMap, dirToUv(normalize(d + te * eps)), lod).r, sea);
  float hW = max(textureLod(uMap, dirToUv(normalize(d - te * eps)), lod).r, sea);
  float hN = max(textureLod(uMap, dirToUv(normalize(d + tn * eps)), lod).r, sea);
  float hS = max(textureLod(uMap, dirToUv(normalize(d - tn * eps)), lod).r, sea);
  vec2 g = vec2(hE - hW, hN - hS) / (2.0 * eps);
  float dl = 0.012;
  float nE = fbm3((d + te * dl) * 38.0 + uC.z);
  float nN = fbm3((d + tn * dl) * 38.0 + uC.z);
  g += vec2(nE - n1, nN - n1) / dl * 0.045 * dFade;
  g += (vec2(n3, n4) - 0.5) * (0.55 * mFade + 0.45 * hFade);
  g *= uB.z * 0.3 * uTune.x * (1.0 - gWater) * uMapMix;
  g /= 1.0 + 0.6 * length(g);
  vec3 nObj = normalize(d - te * g.x - tn * g.y);

  vec3 Ng = normalize(vWx * d.x + vWy * d.y + vWz * d.z);
  vec3 N = normalize(vWx * nObj.x + vWy * nObj.y + vWz * nObj.z);
  vec3 L = normalize(uSunPos - vWorld);
  vec3 V = normalize(cameraPosition - vWorld);

  // Terminator: bramka na normalnej GEOMETRYCZNEJ (relief nie świeci po nocnej stronie), miękkość z atmosfery.
  float wrap = uC.y;
  float ndlG = dot(Ng, L);
  float gate = smoothstep(-wrap - 0.02, wrap + 0.06, ndlG);
  float diff = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0) * gate;
  float atm = clamp((wrap - 0.02) * 9.0, 0.0, 1.0);
  vec3 sun = uSunColor * mix(vec3(1.0), mix(vec3(1.0, 0.62, 0.38), vec3(1.0), smoothstep(-0.05, 0.4, ndlG)), atm * 0.8);
  vec3 col = alb * (uAmbient + sun * diff);

  // Odblask: woda — mały, ostry błysk słońca ważony Fresnelem (jaśniejszy przy płaskim kącie) + wąska aureola
  // skrzenia; lód — matowy połysk.
  vec3 Hh = normalize(L + V);
  vec3 Nw = normalize(Ng + (vec3(n3, n2, n1) - 0.5) * 0.035 * mFade);
  float nhW = max(dot(Nw, Hh), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
  float specW = (pow(nhW, 900.0) * 2.6 + pow(nhW, 150.0) * 0.07) * (0.30 + 5.0 * fres) * gWater;
  float specI = pow(max(dot(N, Hh), 0.0), 28.0) * 0.22 * gIce;
  col += sun * (specW + specI) * uB.w * uTune.y * gate;

  // Żar lawy (HDR — łapie bloom) i slot świateł miast po nocnej stronie (CS-9; dziś czarna tekstura).
  col += gGlowCol * gGlow * uC.x * uTune.z;
  col += textureLod(uCityLights, uv, lod).rgb * uCityGain * (1.0 - gate);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ⚠ Liczone RAZ, na starcie modułu (wzór SunShader / AtmosphereShader): brak kotwicy rzuca przy imporcie, nie w grze.
export const SURFACE_VERT_LOGDEPTH = withLogDepthVertex(SURFACE_VERT);
export const SURFACE_FRAG_LOGDEPTH = withLogDepthFragment(SURFACE_FRAG);

/** Faza szumu detalu z ziarna powierzchni (0…64) — dwa ciała tej samej wielkości nie dzielą wzoru detalu. */
export function surfaceNoisePhase(surfaceSeed) { return ((surfaceSeed >>> 0) % 4096) / 64; }

/**
 * Uniformy materiału z wyglądu (`resolveSurfaceLook`). Wektory to zwykłe tablice — three wgrywa je przez uniform*fv.
 * @param {object} look wynik resolveSurfaceLook
 * @param {{map:object, city:object, shared?:object, surfaceSeed?:number}} opts tekstury zastępcze + uniformy wspólne
 */
export function createSurfaceUniforms(look, opts = {}) {
  const shared = opts.shared ?? SURFACE_SHARED_UNIFORMS;
  return {
    uMap:         { value: opts.map ?? null },
    uCityLights:  { value: opts.city ?? null },
    uMapSize:     { value: [256, 128] },
    uMapMix:      { value: 0 },
    uCityGain:    { value: 0 },
    uLook:        { value: look.look },
    uPal:         { value: look.colors },
    uPlaceholder: { value: look.placeholder.slice() },
    uA:           { value: [-1, look.capT, look.mode, look.mThr] },
    uB:           { value: [look.eThr, look.eMode, look.relief, look.specular] },
    uC:           { value: [look.emissive, look.wrap, surfaceNoisePhase(opts.surfaceSeed ?? 0), 0] },
    uSunPos:      shared.uSunPos,
    uSunColor:    shared.uSunColor,
    uAmbient:     shared.uAmbient,
    uTune:        shared.uTune,
  };
}

let _placeholders = null;
/** Tekstury 1×1 dzielone przez wszystkie materiały: neutralna próbka pola i czerń świateł miast. Nigdy nie zwalniane. */
function placeholderTextures(THREE) {
  if (_placeholders && _placeholders.THREE === THREE) return _placeholders;
  const mk = (bytes) => {
    const t = new THREE.DataTexture(new Uint8Array(bytes), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  };
  _placeholders = { THREE, neutral: mk([150, 128, 180, 128]), black: mk([0, 0, 0, 255]) };
  return _placeholders;
}

/** Zwolnij teksturę mapy należącą do materiału (no-op dla materiału bez mapy / innego rodzaju). */
export function disposeSurfaceMap(material) {
  const tex = material?.userData?.surfaceMapTexture;
  if (!tex) return;
  tex.dispose();
  material.userData.surfaceMapTexture = null;
}

/**
 * Materiał powierzchni ciała. Startuje z barwą zastępczą (uMapMix 0); mapa wchodzi przez `applySurfaceMap`.
 * Tekstura mapy jest WŁASNOŚCIĄ materiału — zwalnia ją zdarzenie `dispose` materiału (każda ścieżka sprzątania
 * rendererów woła `material.dispose()`, więc nie trzeba dopisywać sprzątania w każdej z nich).
 */
export function createSurfaceMaterial(THREE, look, opts = {}) {
  const ph = placeholderTextures(THREE);
  const uniforms = createSurfaceUniforms(look, { map: ph.neutral, city: ph.black, shared: opts.shared, surfaceSeed: opts.surfaceSeed });
  const logDepth = !!opts.logDepth;
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   logDepth ? SURFACE_VERT_LOGDEPTH : SURFACE_VERT,
    fragmentShader: logDepth ? SURFACE_FRAG_LOGDEPTH : SURFACE_FRAG,
  });
  material.userData.surfaceShader = true;
  material.userData.surfaceLook = look;
  material.userData.surfaceMapTexture = null;
  material.addEventListener('dispose', () => disposeSurfaceMap(material));
  return material;
}

/**
 * Podmień mapę w ISTNIEJĄCYM materiale (bez przebudowy siatki). `map` = wpis SurfaceCache ({data, w, h}).
 * Bajty mapy są dzielone z cache (three ich nie kopiuje) — nikt ich nie modyfikuje.
 * @param {number} seaLevel poziom morza w kanale e (−1 = brak) — `surfaceSeaLevelOf(body)`
 * @param {boolean} [instant] true = bez przejścia (mapa była w cache przy budowie materiału)
 */
export function applySurfaceMap(THREE, material, map, seaLevel = -1, instant = false) {
  if (!material?.userData?.surfaceShader || !map?.data) return false;
  const tex = new THREE.DataTexture(map.data, map.w, map.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  disposeSurfaceMap(material);
  material.userData.surfaceMapTexture = tex;
  const u = material.uniforms;
  u.uMap.value = tex;
  u.uMapSize.value[0] = map.w; u.uMapSize.value[1] = map.h;
  u.uA.value[0] = seaLevel;
  if (instant) u.uMapMix.value = 1;
  return true;
}

export const SurfaceShader = {
  SURFACE_VERT, SURFACE_FRAG, SURFACE_VERT_LOGDEPTH, SURFACE_FRAG_LOGDEPTH,
  SURFACE_SHARED_UNIFORMS, SURFACE_SUN_TINT, SURFACE_FADE_SECONDS, SURFACE_HERO_PX,
  surfaceSunColor, surfaceFillLightColor, surfaceHeroDecision, surfaceNoisePhase, createSurfaceUniforms, createSurfaceMaterial, applySurfaceMap, disposeSurfaceMap,
};
