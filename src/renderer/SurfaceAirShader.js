// SurfaceAirShader — atmosfera, chmury i pokłady ciał na wspólnym shaderze (ARC COLONY SPHERE, krok CS-6b; plan §3.7).
//
// Dwie powłoki na ciało z atmosferą (tyle samo rysowań co dzisiejsza para „chmury + poświata"):
//   • POWŁOKA (AIR_FRAG, promień AIR_SHELL_SCALE, FrontSide, alfa premultiplikowana) — w jednym fragmencie:
//       – zasłona: rozproszenie dzienne (mgiełka podnosząca ciemne oceany; rośnie ku limbowi) ALBO nieprzezroczysty
//         pokład / mgła (Wenus, Tytan) z pasmami i wirami; jeden parametr `hazeOpacity` (uVeil.x) — CS-7 rozrzedzi
//         go w widoku kolonii (`setHazeOpacity`),
//       – chmury: pokrycie z archetypu, wzór z ziarna (uPhase + skala / pasmowość / wiry). Chmury EWOLUUJĄ (strojenie
//         CS-6b, §3.7.1): układy pogodowe w dwóch fazach przenikania (uFlow.x) powstają i zanikają, wiatry pasmowe
//         przesuwają je różnie na różnych szerokościach (uFlow.y / .z), a oktawy detalu suną względem siebie.
//         Powłoka WSPÓŁOBRACA się z ciałem (ThreeRenderer kopiuje orientację siatki) — wiatry i wolny dryf (uShape.w)
//         są ruchem WZGLĘDEM powierzchni. Zegar pogody = zegar gry (weatherRate w SurfaceAirLogic).
//         Wygląd (strojenie #2): zmienna gęstość — cienkie półprzezroczyste woale i postrzępione brzegi obok grubszych
//         mas, miękkie krawędzie, grubsze partie lekko szare od strony cienia; bez wzoru komórkowego.
//   • POŚWIATA (AIR_HALO_FRAG, promień haloScale, BackSide, addytywna) — rozpraszanie na limbie poza tarczą: najjaśniej
//     przy powierzchni, zanik z wysokością, strona dzienna + miękki pas zmierzchu, wzmocnienie pod światło.
//
// Światło: TE SAME uniformy wspólne co powierzchnia (SURFACE_SHARED_UNIFORMS — zmiękczona barwa gwiazdy, D-CS-21).
// ⚠ Zasady GLSL repo: wartości per ciało WYŁĄCZNIE przez uniformy (wspólny cache programów), zero grawisów w GLSL,
//   głębia logarytmiczna przez LogDepthChunks; sonda kompilacji: probe-cs6b-air.mjs --compile (z kontrolą failującą).
// ⚠ Moduł nie importuje three (THREE wstrzykiwane — wykonuje się pod node w keeperze) ani GameConfig. Bramka flagi
//   FEATURES.sharedSurface stoi u wołającego (ThreeRenderer._syncSharedAir).

import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';
import { SURFACE_SHARED_UNIFORMS } from './SurfaceShader.js';

export const AIR_VERT = /* glsl */`
uniform vec3 uSunPos;

varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vWN;
varying vec3 vSunObj;

void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  // Kierunek gwiazdy w przestrzeni obiektu (cieniowanie własne chmur próbkuje wzór w stronę światła).
  vSunObj = (uSunPos - wp.xyz) * mat3(modelMatrix);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const AIR_FRAG = /* glsl */`
uniform vec3 uSunPos;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uVeilA;
uniform vec3 uVeilB;
uniform vec3 uVeilC;
uniform vec3 uCloudCol;
uniform vec3 uTwilight;
uniform vec4 uVeil;
uniform vec4 uCloud;
uniform vec4 uShape;
uniform vec4 uFlow;
uniform vec3 uPhase;

varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vWN;
varying vec3 vSunObj;

// uVeil = (hazeOpacity, udział alfy w środku tarczy, 1 = pokład nieprzezroczysty / 0 = rozproszenie dzienne, pasma)
// uCloud = (pokrycie, alfa, skala, pasmowość) · uShape = (wiry, liczba pasm zasłony, zawinięcie światła, kąt dryfu)
// uFlow = (faza pogody [cykle], wiatr pasmowy [rad długości na cykl], liczba pasm wiatru, cieniowanie grubych partii 0…1)

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

// Układy pogodowe jednej fazy: dwie oktawy; k = numer cyklu (każdy cykl ma własny wzór).
float weather(vec3 q, float k) {
  vec3 s = q + k * vec3(7.31, 3.77, 5.13);
  float a = vnoise(s);
  s = s.yzx * 2.03 + 17.13;
  return a * 0.64 + vnoise(s) * 0.36;
}

vec3 rotY(vec3 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

void main() {
  vec3 d = normalize(vObj);
  vec3 N = normalize(vWN);
  vec3 L = normalize(uSunPos - vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = dot(N, L);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fw = max(length(dFdx(d)), length(dFdy(d)));
  float fine = 1.0 - ss(0.004, 0.02, fw);

  // Dryf: sztywny obrót wzoru wokół osi; faza pogody (uFlow.x) wolno przesuwa pole zawinięcia (ewolucja wirów).
  float ang = uShape.w;
  float ph = uFlow.x;
  vec3 p = rotY(d, ang);
  vec3 wq = p * 1.7 + uPhase + vec3(0.0, ph * 0.42, 0.0);
  vec3 w = vec3(vnoise(wq), vnoise(wq + 19.7), vnoise(wq + 43.1)) - 0.5;
  float lat = p.y + w.y * 0.35 * uShape.x;

  // Światło: miękka bramka dnia (zawinięcie rośnie z gęstością atmosfery) i pas zmierzchu.
  float wrap = uShape.z;
  float day = ss(-wrap, wrap + 0.22, ndl);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  float tw = exp(-abs(ndl) / 0.16);
  vec3 sun = uSunColor * mix(vec3(1.0), uTwilight, tw * 0.5);

  // Zasłona: barwa z pasm (szum rozciągnięty wzdłuż równoleżników) i wirów; cienka atmosfera — jaśniej ku limbowi.
  float limb = pow(1.0 - ndv, 2.2);
  vec3 veilCol = mix(uVeilA, uVeilC, limb * (1.0 - uVeil.z) * 0.6);
  float vb = uVeil.w;
  if (vb > 0.001) {
    vec3 sq = vec3(p.x * 0.55, lat * uShape.y, p.z * 0.55) + w * 0.9 * uShape.x + uPhase.yzx;
    float streak = fbm3(sq);
    float swirl = fbm3(p * 3.1 + w * 2.2 * uShape.x + uPhase.zxy);
    float fineN = vnoise(p * 11.0 + w * 3.0 + uPhase) - 0.5;
    veilCol = mix(veilCol, uVeilB, ss(0.38, 0.62, streak + fineN * 0.10 * fine) * vb);
    veilCol = mix(veilCol, uVeilC, ss(0.50, 0.78, swirl + fineN * 0.08 * fine) * vb * 0.8);
  }
  float aV = uVeil.x * mix(uVeil.y, 1.0, limb) * mix(day, 1.0, uVeil.z);
  vec3 veilRGB = veilCol * (uAmbient + sun * mix(day, diff, uVeil.z)) * mix(1.0, 0.70 + 0.30 * ndv, uVeil.z);

  // Chmury (strojenie CS-6b #2, §3.7.1) — w układzie OBRACAJĄCEGO SIĘ ciała:
  //   1. UKŁADY POGODOWE (GDZIE są chmury): niska częstotliwość, DWIE fazy przesunięte o pół cyklu i przenikane
  //      wagami trójkątnymi — każda faza żyje jeden cykl i wraca z nowym wzorem (układy powstają, rosną, zanikają).
  //      W obrębie fazy wiatr pasmowy przesuwa wzór wzdłuż równoleżników (ograniczone do pół cyklu — bez smug);
  //      łagodne zawinięcie samych układów daje fronty i spirale.
  //   2. DETAL: trzy oktawy miękkiego szumu, sunące względem siebie z fazą pogody (kształty się przelewają).
  //   3. GĘSTOŚĆ: szeroka rampa — cienki półprzezroczysty woal i postrzępiony brzeg, dalej gruby rdzeń.
  // Cieniowanie: detal próbkowany w stronę gwiazdy — grubsze partie lekko szarzeją od strony cienia.
  float aC = 0.0;
  vec3 cloudRGB = vec3(0.0);
  float cov = uCloud.x;
  if (cov > 0.004) {
    float f1 = fract(ph);
    float f2 = fract(ph + 0.5);
    float w1 = 1.0 - abs(2.0 * f1 - 1.0);
    float w2 = 1.0 - w1;
    float wind = uFlow.y * sin(p.y * 3.14159 * uFlow.z + uPhase.x);
    vec3 cq = uPhase + w * 0.55 * uShape.x;
    float sc = uCloud.z * 0.6;
    float sA = weather(rotY(p, wind * (f1 - 0.5)) * sc + cq, floor(ph));
    float sB = weather(rotY(p, wind * (f2 - 0.5)) * sc + cq, floor(ph + 0.5) + 0.37);
    // Przenikanie dwóch niezależnych pól spłaszcza kontrast w połowie drogi — wyrównanie wariancji.
    float big = 0.5 + ((sA - 0.5) * w1 + (sB - 0.5) * w2) / sqrt(w1 * w1 + w2 * w2);
    big = clamp((big - 0.5) * 1.7 + 0.5, 0.0, 1.0);
    float belt = 0.5 + 0.5 * sin(lat * (2.5 + uCloud.z) + (big - 0.5) * 3.0);
    float sys = mix(big, big * 0.74 + belt * 0.26, uCloud.w);

    vec3 ev = vec3(0.0, ph * 1.3, 0.0);
    vec3 dq = p * uCloud.z * 2.6 + uPhase.zxy + w * 0.8 * uShape.x;
    vec3 d2q = dq.yzx * 2.07 + 13.7 - ev * 1.4;
    float d1 = vnoise(dq + ev);
    float d2 = vnoise(d2q);
    float d3 = vnoise(d2q.yzx * 2.11 + 5.3 + ev);
    float det = d1 * 0.50 + d2 * 0.30 + d3 * 0.20;
    float wisp = (vnoise(d2q * 4.6 + 3.7) - 0.5) * fine;
    float n = sys * 0.52 + det * 0.48 + wisp * 0.06;
    float thr = 0.69 - 0.25 * cov;
    float thin = ss(thr - 0.085, thr + 0.03, n);
    float thick = ss(thr + 0.01, thr + 0.15, n);
    float den = thin * 0.42 + thick * 0.58;
    vec3 so = rotY(normalize(vSunObj), ang) * 0.17;
    float lit = d1 * 0.62 + d2 * 0.38;
    float litS = vnoise(dq + ev + so) * 0.62 + vnoise(d2q + so.yzx * 2.07) * 0.38;
    float relief = clamp(1.0 + (lit - litS) * 2.6 * uFlow.w * thick, 0.72, 1.12);
    // Limb: warstwa widziana pod ostrym kątem zlewa się w mgiełkę — bez ostrych smug na samej krawędzi tarczy.
    aC = den * uCloud.y * (1.0 - 0.30 * limb * limb);
    cloudRGB = uCloudCol * (uAmbient + sun * diff * relief) * (0.84 + 0.16 * thick);
  }

  float a = aC + aV * (1.0 - aC);
  if (a < 0.003) discard;
  gl_FragColor = vec4(cloudRGB * aC + veilRGB * aV * (1.0 - aC), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const AIR_HALO_FRAG = /* glsl */`
uniform vec3 uSunPos;
uniform vec3 uSunColor;
uniform vec3 uTint;
uniform vec3 uTwilight;
uniform vec4 uHalo;

varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vWN;

// uHalo = (siła, zawinięcie za terminator, promień powłoki / promień ciała, wzmocnienie pod światło)

void main() {
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunPos - vWorld);
  float ndv = dot(N, V);
  // Wysokość promienia widzenia nad powierzchnią: 0 = limb ciała, 1 = krawędź powłoki.
  float b = uHalo.z * sqrt(max(1.0 - ndv * ndv, 0.0));
  float h = clamp((b - 1.0) / max(uHalo.z - 1.0, 0.0001), 0.0, 1.0);
  float glow = exp(-h * 3.4) * (1.0 - smoothstep(0.62, 1.0, h));

  float ndl = dot(N, L);
  float wrap = uHalo.y;
  float day = smoothstep(-wrap, wrap, ndl);
  float tw = exp(-abs(ndl) / max(wrap, 0.05));
  tw = tw * sqrt(tw);
  float fwd = max(dot(-V, L), 0.0);
  fwd = fwd * fwd;
  fwd = fwd * fwd * fwd;
  vec3 col = mix(uTint, uTwilight, tw * 0.45) * uSunColor * 1.2;
  float a = glow * uHalo.x * day * (1.0 + uHalo.w * fwd);
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ⚠ Liczone RAZ, na starcie modułu (wzór SurfaceShader): brak kotwicy rzuca przy imporcie, nie w grze.
export const AIR_VERT_LOGDEPTH = withLogDepthVertex(AIR_VERT);
export const AIR_FRAG_LOGDEPTH = withLogDepthFragment(AIR_FRAG);
export const AIR_HALO_FRAG_LOGDEPTH = withLogDepthFragment(AIR_HALO_FRAG);

/** Wzmocnienie poświaty pod światło (ciało między kamerą a gwiazdą — cienki jasny łuk). */
export const AIR_FORWARD_SCATTER = 1.6;

/** Uniformy powłoki chmur / zasłony z wyglądu (`resolveAirLook`). Wektory to zwykłe tablice (uniform*fv). */
export function createAirUniforms(air, shared = SURFACE_SHARED_UNIFORMS) {
  return {
    uSunPos: shared.uSunPos, uSunColor: shared.uSunColor, uAmbient: shared.uAmbient,
    uVeilA: { value: air.veilA.slice() }, uVeilB: { value: air.veilB.slice() }, uVeilC: { value: air.veilC.slice() },
    uCloudCol: { value: air.cloud.slice() }, uTwilight: { value: air.twilight.slice() },
    uVeil:  { value: [air.hazeOpacity, air.veilCenter, air.veilOpaque, air.veilBand] },
    uCloud: { value: [air.cloudCoverage, air.cloudAlpha, air.cloudScale, air.cloudBand] },
    uShape: { value: [air.cloudWarp, air.bandFreq, air.haloWrap, 0] },
    uFlow:  { value: [air.weatherPhase, air.wind, air.windBands, air.cloudShade] },
    uPhase: { value: air.phase.slice() },
  };
}

/** Uniformy poświaty limbu. */
export function createHaloUniforms(air, shared = SURFACE_SHARED_UNIFORMS) {
  return {
    uSunPos: shared.uSunPos, uSunColor: shared.uSunColor,
    uTint: { value: air.tint.slice() }, uTwilight: { value: air.twilight.slice() },
    uHalo: { value: [air.haloStrength, air.haloWrap, air.haloScale, AIR_FORWARD_SCATTER] },
  };
}

/**
 * Para materiałów powietrza ciała: `shell` (chmury + zasłona) i `halo` (poświata limbu).
 * @param {object} THREE moduł three (wstrzykiwany)
 * @param {object} air wynik resolveAirLook
 * @param {{logDepth?:boolean, shared?:object}} [opts]
 */
export function createAirMaterials(THREE, air, opts = {}) {
  const logDepth = !!opts.logDepth;
  const vert = logDepth ? AIR_VERT_LOGDEPTH : AIR_VERT;
  const shell = new THREE.ShaderMaterial({
    uniforms: createAirUniforms(air, opts.shared),
    vertexShader: vert,
    fragmentShader: logDepth ? AIR_FRAG_LOGDEPTH : AIR_FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: true, side: THREE.FrontSide,
  });
  const halo = new THREE.ShaderMaterial({
    uniforms: createHaloUniforms(air, opts.shared),
    vertexShader: vert,
    fragmentShader: logDepth ? AIR_HALO_FRAG_LOGDEPTH : AIR_HALO_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.BackSide,
  });
  shell.userData.surfaceAir = 'shell';
  shell.userData.airLook = air;
  halo.userData.surfaceAir = 'halo';
  return { shell, halo };
}

/** Bieżąca nieprzezroczystość zasłony / pokładu ciała (0…1). */
export function hazeOpacityOf(shellMaterial) {
  return shellMaterial?.userData?.surfaceAir === 'shell' ? shellMaterial.uniforms.uVeil.value[0] : null;
}

/**
 * JEDEN parametr na ciało: nieprzezroczystość zasłony / pokładu (Wenus, Tytan). Mapa układu trzyma wartość z
 * archetypu; CS-7 rozrzedzi ją w widoku kolonii. Zwraca ustawioną wartość albo null (materiał innego rodzaju).
 */
export function setHazeOpacity(shellMaterial, value) {
  if (shellMaterial?.userData?.surfaceAir !== 'shell' || !Number.isFinite(value)) return null;
  const v = value < 0 ? 0 : (value > 1 ? 1 : value);
  shellMaterial.uniforms.uVeil.value[0] = v;
  return v;
}

/**
 * Zegar pogody ciała: kąt sztywnego dryfu (uShape.w) i faza ewolucji (uFlow.x). Wołający liczy oba z czasu POGODY
 * (czas realny × `weatherRate` — pauza gry = brak zmian). Zwraca true, gdy materiał jest powłoką.
 */
export function setAirClock(shellMaterial, driftAngle, weatherPhase) {
  if (shellMaterial?.userData?.surfaceAir !== 'shell') return false;
  if (Number.isFinite(driftAngle)) shellMaterial.uniforms.uShape.value[3] = driftAngle;
  if (Number.isFinite(weatherPhase)) shellMaterial.uniforms.uFlow.value[0] = weatherPhase;
  return true;
}

export const SurfaceAirShader = {
  AIR_VERT, AIR_FRAG, AIR_HALO_FRAG, AIR_VERT_LOGDEPTH, AIR_FRAG_LOGDEPTH, AIR_HALO_FRAG_LOGDEPTH, AIR_FORWARD_SCATTER,
  createAirUniforms, createHaloUniforms, createAirMaterials, hazeOpacityOf, setHazeOpacity, setAirClock,
};
