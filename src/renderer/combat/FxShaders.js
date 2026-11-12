// FxShaders — GLSL silnika efektów walki (ARC COMBAT VISUALS, krok CV-2a, §2.10 / §2.12).
//
// Dwa programy na cały silnik:
//   STREAK — wstęga między dwoma punktami, zawsze frontem do kamery (wiązka lasera, smuga pocisku). Szerokość w świecie
//            z PODŁOGĄ EKRANOWĄ (`uMinPx`, CSS px): strzał zostaje czytelny przy każdym zoomie; rdzeń HDR ponad progiem
//            bloomu (1,0 — `ThreeRenderer` UnrealBloomPass), więc rdzeń świeci, a nie tylko jest jasny. Dzisiejsza linia
//            1 px nigdy do bloomu nie dochodziła (Finding 618).
//   SPARK  — billboard w punkcie (błysk trafienia, pierścień osłony, błysk na modelu); rozmiar ze świata z podłogą
//            i sufitem ekranowym per rodzaj (sufit = dawny limit „Obserwuj”, CP14).
//
// Reguły (§2.12-5): wartości per efekt idą ATRYBUTEM instancji albo UNIFORMEM, nigdy interpolacją stringa do GLSL —
// wiązka i smuga dzielą jeden program (ten sam tekst, inne uniformy), więc trzy pule = dwa programy. Chunki
// LOGARYTMICZNEJ GŁĘBI (V-267) dokłada `buildFxShaders({ logDepth: true })` — bez nich efekt pisałby głębię
// stałoprzecinkową i przegrywał test głębi z każdym statkiem i planetą (zachowywałby się, jakby leżał w nieskończoności).
//
// Czas: `uTime` i `aParams.y` (narodziny) w ms ZEGARA PREZENTACJI (PresentationClock), względem epoki silnika — pauza
// zatrzymuje `uTime`, więc w pauzie każdy efekt stoi (D-CV-10, Finding 616).
//
// ⚠ Moduł importuje wyłącznie LogDepthChunks (zero importów) — wykonuje się pod node (keeper czyta teksty programów).
// ⚠ Wczesne wyjście wierzchołka (`gl_Position` poza bryłą obcinania) stoi PRZED ostatnim przypisaniem `gl_Position` —
//   `withLogDepthVertex` wstawia ciało chunku po OSTATNIM przypisaniu, więc kolejność w tekście jest częścią kontraktu.

import { withLogDepthVertex, withLogDepthFragment } from '../LogDepthChunks.js';

// ── STREAK ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Geometria bazowa: 4 narożniki `position.xy` — x: 0 = początek, 1 = koniec; y: −1 / +1 w poprzek.
export const STREAK_VERT = `
uniform float uTime;
uniform float uWidth;
uniform float uMinPx;
uniform float uPxToWorld;
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec3 aColor;
attribute vec4 aParams;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float age = uTime - aParams.y;
  vUv = position.xy;
  vColor = aColor;
  vAlpha = 0.0;
  if (age < 0.0 || age > aParams.z) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vAlpha = aParams.x * (1.0 - age / max(aParams.z, 1.0));
  vec4 vs = modelViewMatrix * vec4(aStart, 1.0);
  vec4 ve = modelViewMatrix * vec4(aEnd, 1.0);
  vec3 p = mix(vs.xyz, ve.xyz, position.x);
  vec3 d = ve.xyz - vs.xyz;
  float len = length(d);
  d = len > 1e-6 ? d / len : vec3(1.0, 0.0, 0.0);
  vec3 side = cross(d, normalize(vec3(0.0, 0.0, 1e-6) - p));
  float sl = length(side);
  side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
  float depth = max(-p.z, 1e-4);
  float halfW = max(uWidth * aParams.w, 0.5 * uMinPx * uPxToWorld * depth);
  p += side * (halfW * position.y);
  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;

// uStyle: 0 = wiązka (równa na całej długości), 1 = smuga pocisku (jaśniejsza głowa przy celu, gasnący ogon).
export const STREAK_FRAG = `
uniform float uCore;
uniform float uStyle;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float a = abs(vUv.y);
  float glow = 1.0 - smoothstep(0.0, 1.0, a);
  float core = 1.0 - smoothstep(0.0, 0.32, a);
  float head = mix(1.0, 0.3 + 0.7 * vUv.x * vUv.x, uStyle);
  vec3 hot = mix(vColor, vec3(1.0), 0.6 * core);
  vec3 col = hot * (0.55 * glow + uCore * core) * head;
  gl_FragColor = vec4(col, vAlpha * glow);
}
`;

// ── SPARK ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Geometria bazowa: 4 narożniki `position.xy` w [−1, 1]². aKind: 0 błysk trafienia · 1 pierścień osłony · 2 błysk na
// modelu. Błysk i pierścień rosną ×1 → ×uGrow i gasną liniowo (dziś ×3; ARC CV-3a3 — pod sceną bitwy mniej, Finding 653);
// błysk na modelu ma stały rozmiar (uGrow.z = 1). Billboard przysunięty do kamery o pół rozmiaru (nie więcej niż pół
// głębi) — inaczej przód modelu zasłaniałby rdzeń błysku.
export const SPARK_VERT = `
uniform float uTime;
uniform float uPxToWorld;
uniform vec3 uSizeK;
uniform vec3 uMinPx;
uniform vec3 uMaxPx;
uniform vec3 uGrow;
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec4 aParams;
attribute float aKind;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
float pickKind(vec3 v, float k) {
  return k < 0.5 ? v.x : (k < 1.5 ? v.y : v.z);
}
void main() {
  float age = uTime - aParams.y;
  vUv = position.xy;
  vColor = aColor;
  vKind = aKind;
  vAlpha = 0.0;
  if (age < 0.0 || age > aParams.z) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float p = age / max(aParams.z, 1.0);
  vAlpha = aParams.x * (1.0 - p);
  float grow = 1.0 + (pickKind(uGrow, aKind) - 1.0) * p;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float depth = max(-mv.z, 1e-4);
  float pxW = uPxToWorld * depth;
  float lo = pickKind(uMinPx, aKind) * pxW;
  float hi = max(lo, pickKind(uMaxPx, aKind) * pxW);
  float size = clamp(aParams.w * pickKind(uSizeK, aKind) * grow, lo, hi);
  vec3 toCam = normalize(vec3(0.0, 0.0, 1e-6) - mv.xyz);
  mv.xyz += toCam * min(0.5 * size, 0.5 * depth);
  mv.xy += position.xy * (0.5 * size);
  gl_Position = projectionMatrix * mv;
}
`;

export const SPARK_FRAG = `
uniform float uCore;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float shape;
  float core = 0.0;
  if (vKind < 0.5) {
    float s = 1.0 - r;
    shape = s * s;
    core = 1.0 - smoothstep(0.0, 0.4, r);
  } else if (vKind < 1.5) {
    shape = 1.0 - smoothstep(0.0, 0.16, abs(r - 0.78));
  } else {
    float s = 1.0 - r * r;
    shape = s * s;
  }
  vec3 col = mix(vColor, vec3(1.0), 0.6 * core) * shape * (1.0 + uCore * core);
  gl_FragColor = vec4(col, vAlpha * shape);
}
`;

// ── BOLT (ARC CV-4a — język broni) ─────────────────────────────────────────────────────────────────────────────────
// Pocisk w LOCIE (kinetyk, rakieta): wstęga od ogona do głowy wzdłuż krzywej Béziera 2. stopnia (start → punkt kontrolny →
// koniec; kinetyk — prosta: punkt kontrolny w połowie). Głowa jedzie z wiekiem (u = wiek / lot), ogon `aTime.z` ms za nią;
// trafienie — wstęga znika w chwili uderzenia (iskry przejmują obraz), pudło (`aTime.w` = 1) — leci dalej za cel i gaśnie
// w drugiej części lotu. Geometria: pasek z `BOLT_SEGMENTS` odcinków (x ∈ [0, 1] — ogon → głowa, y = ±1 w poprzek), więc
// zakręt ogona rakiety jest krzywą, nie cięciwą. Rachunek krzywej w przestrzeni widoku (krzywa Béziera nie zmienia się przy
// przekształceniu afinicznym), szerokość z podłogą ekranową jak STREAK.
export const BOLT_SEGMENTS = 12;
export const BOLT_VERT = `
uniform float uTime;
uniform float uWidth;
uniform float uMinPx;
uniform float uPxToWorld;
attribute vec3 aStart;
attribute vec3 aCtrl;
attribute vec3 aEnd;
attribute vec3 aColor;
attribute vec4 aTime;
attribute vec4 aStyle;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vHead;
vec3 bez(vec3 a, vec3 c, vec3 b, float u) {
  float v = 1.0 - u;
  return v * v * a + 2.0 * u * v * c + u * u * b;
}
vec3 bezD(vec3 a, vec3 c, vec3 b, float u) {
  return 2.0 * (1.0 - u) * (c - a) + 2.0 * u * (b - c);
}
void main() {
  float age = uTime - aTime.x;
  float fl = max(aTime.y, 1.0);
  vUv = position.xy;
  vColor = aColor;
  vHead = aStyle.z;
  vAlpha = 0.0;
  if (age < 0.0 || age > fl) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float uH = clamp(age / fl, 0.0, 1.0);
  float uT = clamp((age - aTime.z) / fl, 0.0, 1.0);
  float u = mix(uT, uH, position.x);
  vec3 s = (modelViewMatrix * vec4(aStart, 1.0)).xyz;
  vec3 c = (modelViewMatrix * vec4(aCtrl, 1.0)).xyz;
  vec3 e = (modelViewMatrix * vec4(aEnd, 1.0)).xyz;
  vec3 p = bez(s, c, e, u);
  vec3 d = bezD(s, c, e, u);
  float len = length(d);
  d = len > 1e-6 ? d / len : vec3(1.0, 0.0, 0.0);
  vec3 side = cross(d, normalize(vec3(0.0, 0.0, 1e-6) - p));
  float sl = length(side);
  side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
  float depth = max(-p.z, 1e-4);
  float halfW = max(uWidth * aStyle.y, 0.5 * uMinPx * uPxToWorld * depth) * mix(0.35, 1.0, position.x);
  p += side * (halfW * position.y);
  float miss = aTime.w > 0.5 ? 1.0 - smoothstep(0.55, 1.0, uH) : 1.0;
  vAlpha = aStyle.x * miss;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;

export const BOLT_FRAG = `
uniform float uCore;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vHead;
void main() {
  float a = abs(vUv.y);
  float glow = 1.0 - smoothstep(0.0, 1.0, a);
  float core = 1.0 - smoothstep(0.0, 0.32, a);
  float along = vUv.x;
  float trail = along * along;
  float head = smoothstep(0.82, 1.0, along);
  vec3 hot = mix(vColor, vec3(1.0), 0.6 * core);
  vec3 col = hot * (0.5 * glow + uCore * core) * (0.15 + 0.85 * trail) * (1.0 + vHead * head);
  gl_FragColor = vec4(col, vAlpha * glow * (0.1 + 0.9 * trail));
}
`;

// ── MOTE (ARC CV-4a — język broni) ─────────────────────────────────────────────────────────────────────────────────
// Punkt świetlny z RUCHEM (iskry trafienia lecą od kadłuba, błysk wylotu, żar trafienia, ładowanie lasera). aShape.x —
// rodzaj: 0 iskra (gorący punkt, gaśnie z kwadratem), 1 poświata (miękka, gaśnie liniowo), 2 ładowanie (narasta z kwadratem —
// kończy się w chwili wiązki). Pozycja = aPos + aVel · wiek · (1 − ½ postępu) — hamowanie; rozmiar ze świata z podłogą
// i sufitem ekranowym (aShape.z / .w, CSS px), rośnie ×1 → ×aShape.y.
export const MOTE_VERT = `
uniform float uTime;
uniform float uPxToWorld;
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aParams;
attribute vec4 aShape;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
void main() {
  float age = uTime - aParams.y;
  vUv = position.xy;
  vColor = aColor;
  vKind = aShape.x;
  vAlpha = 0.0;
  if (age < 0.0 || age > aParams.z) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float p = age / max(aParams.z, 1.0);
  vec3 wp = aPos + aVel * (age * (1.0 - 0.5 * p));
  float q = 1.0 - p;
  float env = aShape.x < 0.5 ? q * q : (aShape.x < 1.5 ? q : p * p);
  vAlpha = aParams.x * env;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  float depth = max(-mv.z, 1e-4);
  float pxW = uPxToWorld * depth;
  float lo = aShape.z * pxW;
  float hi = max(lo, aShape.w * pxW);
  float size = clamp(aParams.w * mix(1.0, aShape.y, p), lo, hi);
  vec3 toCam = normalize(vec3(0.0, 0.0, 1e-6) - mv.xyz);
  mv.xyz += toCam * min(0.5 * size, 0.5 * depth);
  mv.xy += position.xy * (0.5 * size);
  gl_Position = projectionMatrix * mv;
}
`;

export const MOTE_FRAG = `
uniform float uCore;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float s = 1.0 - r;
  float shape = vKind < 0.5 ? s * s * s : s * s;
  float core = 1.0 - smoothstep(0.0, vKind < 0.5 ? 0.5 : 0.35, r);
  vec3 col = mix(vColor, vec3(1.0), 0.55 * core) * shape * (1.0 + uCore * core);
  gl_FragColor = vec4(col, vAlpha * shape);
}
`;

// ── BLAST (ARC CV-5 — wybuchy, stany uszkodzeń, płonący wrak; flaga `cvDamage`) ───────────────────────────────────────
// Jeden program dla dwóch pul (dym — rysowany pierwszy, `renderOrder` 1; wybuchy — drugi): billboard frontem do kamery, poza
// falą uderzeniową (kwadrat w płaszczyźnie statku — `aAxis` = normalna płaszczyzny). Mieszanie PREMULTIPLIED (ONE,
// ONE_MINUS_SRC_ALPHA): `rgb` = emisja (+ barwa dymu × krycie), `a` = krycie — gorące części dodają światło (a ≈ 0), dym zasłania
// tło (a > 0) w JEDNYM przebiegu. Rodzaje (`aShape.x`): 0 błysk (rdzeń HDR) · 1 smuga anamorficzna (pozioma na ekranie) · 2 płat
// kuli ognia (turbulencja szumu, barwa w czasie życia: biel → żółć → pomarańcz → ciemna czerwień → szarobrązowy dym, ciemniejsze
// wiry = wrażenie samozasłaniania) · 3 iskra żaru (stygnie) · 4 płomień (stan uszkodzeń, pożar wraku) · 5 fala uderzeniowa
// (cienki pierścień bez zniekształceń) · 6 dym wybuchu (oświetlony z początku przez kulę ognia) · 7 dym uszkodzeń.
// Rozmiary ze świata (`aParams.w` — z długości kadłuba, bez podłóg świata — Finding 619), podłoga EKRANOWA tylko dla czytelności
// z widoku taktycznego (`aShape.y` — podłoga średnicy w px CSS, 0 = bez podłogi; `aShape.w` — proporcja smugi). Czas `uTime` = zegar efektów uszkodzeń (`FX_TIME_SCALE` × zegar prezentacji — pauza = pauza).
export const BLAST_VERT = `
uniform float uTime;
uniform float uPxToWorld;
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aParams;
attribute vec4 aShape;
attribute vec3 aAxis;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
varying float vAge;
varying float vSeed;
void main() {
  float age = uTime - aParams.y;
  float life = max(aParams.z, 1.0);
  vUv = position.xy;
  vColor = aColor;
  vKind = aShape.x;
  vSeed = aShape.z;
  vAlpha = 0.0;
  vAge = 0.0;
  if (age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float p = age / life;
  vAge = p;
  vAlpha = aParams.x;
  float k = aShape.x;
  vec3 wp = aPos + aVel * (age * (1.0 - 0.45 * p));
  float grow = 1.0;
  if (k < 0.5) grow = 0.55 + 0.45 * sqrt(p);
  else if (k < 1.5) grow = 1.0 - 0.3 * p;
  else if (k < 2.5) grow = 0.3 + 0.7 * (1.0 - pow(1.0 - p, 2.2));
  else if (k < 3.5) grow = 1.0 - 0.6 * p;
  else if (k < 4.5) grow = 0.7 + 0.3 * sin(age * 0.045 + aShape.z * 6.2832);
  else if (k < 5.5) grow = 1.0 - pow(1.0 - p, 3.0);
  else grow = 0.45 + 0.9 * (1.0 - pow(1.0 - p, 1.6));
  float size = aParams.w * grow;
  vec4 mv;
  if (k > 4.5 && k < 5.5) {
    vec3 n = normalize(aAxis + vec3(0.0, 1e-5, 0.0));
    vec3 t1 = normalize(abs(n.y) < 0.95 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(n, t1);
    mv = modelViewMatrix * vec4(wp + (t1 * position.x + t2 * position.y) * size, 1.0);
  } else {
    mv = modelViewMatrix * vec4(wp, 1.0);
    float depth = max(-mv.z, 1e-4);
    float hw = max(0.5 * size, 0.5 * aShape.y * uPxToWorld * depth);
    vec3 toCam = normalize(vec3(0.0, 0.0, 1e-6) - mv.xyz);
    float lift = k > 5.5 ? 0.25 : 0.5;
    mv.xyz += toCam * min(lift * 2.0 * hw, 0.5 * depth);
    vec2 axis = k > 0.5 && k < 1.5 ? vec2(hw, hw / max(aShape.w, 1.0)) : vec2(hw);
    mv.xy += position.xy * axis;
  }
  gl_Position = projectionMatrix * mv;
}
`;

export const BLAST_FRAG = `
uniform float uTime;
uniform float uFlashCore;
uniform float uFireCore;
uniform float uFlameCore;
uniform float uRingCore;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vColor;
varying float vKind;
varying float vAge;
varying float vSeed;
float bHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float bNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = bHash(i), b = bHash(i + vec2(1.0, 0.0)), c = bHash(i + vec2(0.0, 1.0)), d = bHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float bFbm(vec2 p) {
  float s = 0.5 * bNoise(p);
  s += 0.3 * bNoise(p * 2.07 + 11.3);
  s += 0.2 * bNoise(p * 4.13 - 7.1);
  return s;
}
void main() {
  float r = length(vUv);
  float k = vKind;
  vec3 emis = vec3(0.0);
  float occ = 0.0;
  if (k < 0.5) {
    if (r > 1.0) discard;
    float s = 1.0 - r;
    float core = 1.0 - smoothstep(0.0, 0.35, r);
    float env = (1.0 - vAge) * (1.0 - vAge);
    emis = mix(vColor, vec3(1.0), 0.7) * (s * s * s * (0.6 + uFlashCore * core)) * env;
  } else if (k < 1.5) {
    float ax = abs(vUv.x), ay = abs(vUv.y);
    float shape = (1.0 - smoothstep(0.0, 1.0, ax)) * (1.0 - smoothstep(0.0, 1.0, ay));
    emis = vec3(0.82, 0.9, 1.0) * shape * shape * (1.0 - vAge) * (0.4 + 0.6 * uFlashCore * (1.0 - smoothstep(0.0, 0.3, ay)));
  } else if (k < 2.5) {
    if (r > 1.0) discard;
    float t = vAge;
    vec2 q = vUv * 1.7 + vec2(vSeed * 17.0, vSeed * 31.0);
    float n = bFbm(q + vec2(t * 1.3, -t * 0.9));
    float n2 = bFbm(q * 2.1 - vec2(t * 0.7, t * 1.6) + n * 0.9);
    float edge = 1.0 - smoothstep(0.3 + 0.5 * n, 1.0, r);
    float dens = clamp(edge * (0.15 + 1.25 * n2 * n2 + 0.35 * n), 0.0, 1.0);
    vec3 c0 = vec3(1.0, 0.97, 0.88), c1 = vec3(1.0, 0.82, 0.32), c2 = vec3(1.0, 0.42, 0.07), c3 = vec3(0.55, 0.07, 0.02);
    vec3 col = t < 0.1 ? mix(c0, c1, t / 0.1) : (t < 0.3 ? mix(c1, c2, (t - 0.1) / 0.2) : mix(c2, c3, clamp((t - 0.3) / 0.35, 0.0, 1.0)));
    float hot = 1.0 - smoothstep(0.42, 0.85, t);
    float swirl = 0.2 + 1.1 * n2;
    float soot = smoothstep(0.55, 0.8, n) * smoothstep(0.18, 0.5, t);
    emis = col * dens * hot * swirl * (0.35 + uFireCore * (1.0 - smoothstep(0.0, 0.55, r)) * (1.0 - t) * n2) * (1.0 - 0.7 * soot);
    occ = dens * max(smoothstep(0.3, 0.7, t) * 0.8, 0.65 * soot) * (1.0 - smoothstep(0.82, 1.0, t)) * vAlpha;
    emis += vec3(0.12, 0.09, 0.075) * occ;
  } else if (k < 3.5) {
    if (r > 1.0) discard;
    float s = 1.0 - r;
    vec3 col = vAge < 0.25 ? mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.62, 0.2), vAge / 0.25) : mix(vec3(1.0, 0.62, 0.2), vec3(0.65, 0.1, 0.02), (vAge - 0.25) / 0.75);
    emis = col * s * s * s * (1.0 - vAge) * (1.0 + 2.0 * uFlameCore * (1.0 - smoothstep(0.0, 0.45, r)));
  } else if (k < 4.5) {
    if (r > 1.0) discard;
    vec2 q = vUv * 2.2 + vec2(vSeed * 13.0, 0.0);
    float n = bFbm(q + vec2(0.0, -uTime * 0.0045) + vAge * 2.3);
    float n2 = bFbm(q * 1.9 + vec2(uTime * 0.002, vAge * 3.1));
    float shape = (1.0 - smoothstep(0.05 + 0.55 * n, 0.95, r)) * (0.35 + 0.9 * n2);
    float env = sin(3.14159 * vAge);
    vec3 col = mix(vec3(0.9, 0.18, 0.03), vec3(1.0, 0.72, 0.28), clamp(1.0 - r * 1.4 + 0.4 * n2, 0.0, 1.0));
    emis = col * shape * env * (0.35 + uFlameCore * (1.0 - smoothstep(0.0, 0.45, r)) * n2);
  } else if (k < 5.5) {
    if (r > 1.0) discard;
    float d = (r - 0.9) / 0.028;
    float band = exp(-d * d);
    emis = mix(vColor, vec3(1.0), 0.4) * band * pow(1.0 - vAge, 2.0) * uRingCore;
  } else {
    if (r > 1.0) discard;
    vec2 q = vUv * 1.35 + vec2(vSeed * 19.0, vSeed * 7.0);
    float n = bFbm(q + vec2(vAge * 0.6, vAge * 0.35));
    float shape = 1.0 - smoothstep(0.28 + 0.38 * n, 1.0, r);
    float fade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge));
    float a = shape * (0.5 + 0.5 * n) * fade * vAlpha;
    float lit = k < 6.5 ? 1.0 - smoothstep(0.0, 0.16, vAge) : 0.0;
    occ = a;
    emis = vColor * a + vec3(1.0, 0.42, 0.1) * (lit * a * 0.8);
  }
  if (k < 5.5 && k > 2.5) emis *= vAlpha;
  if (k < 1.5) emis *= vAlpha;
  gl_FragColor = vec4(emis, occ);
}
`;

// ── DEBRIS (ARC CV-5) — odłamki kadłuba: instancje bryłki (nieregularny ośmiościan), ruch i obrót liczone w shaderze z wieku
// (`uTime` — zegar efektów uszkodzeń), oświetlenie od gwiazdy (początek układu), żar krawędzi na początku życia (HDR, stygnie).
// Nieprzezroczyste (głębia zapisywana) — pod koniec życia bryłka się kurczy, zamiast przenikać.
export const DEBRIS_VERT = `
uniform float uTime;
attribute vec3 aP0;
attribute vec3 aVel;
attribute vec4 aAxis;
attribute vec4 aParams;
attribute vec3 aStretch;
attribute vec3 aColor;
varying vec3 vN;
varying vec3 vWp;
varying float vHot;
varying vec3 vColor;
varying float vShade;
vec3 dRot(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
void main() {
  float age = uTime - aParams.x;
  float life = max(aParams.y, 1.0);
  vHot = 0.0;
  vColor = aColor;
  vShade = aParams.w;
  vN = vec3(0.0, 1.0, 0.0);
  vWp = vec3(0.0);
  if (age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float p = age / life;
  vec3 k = normalize(aAxis.xyz + vec3(1e-5, 0.0, 0.0));
  float ang = aAxis.w * age;
  float sc = aParams.z * (1.0 - smoothstep(0.72, 1.0, p));
  vec3 lp = dRot(position * aStretch, k, ang) * sc;
  vec3 wp = aP0 + aVel * (age * (1.0 - 0.3 * p)) + lp;
  vN = dRot(normalize(normal / max(aStretch, vec3(1e-3))), k, ang);
  vWp = wp;
  vHot = 1.0 - smoothstep(0.0, 0.2, p);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}
`;

export const DEBRIS_FRAG = `
uniform float uCore;
varying vec3 vN;
varying vec3 vWp;
varying float vHot;
varying vec3 vColor;
varying float vShade;
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(-vWp + vec3(1e-5));
  float diff = max(dot(n, L), 0.0);
  vec3 V = normalize(cameraPosition - vWp);
  float rim = 1.0 - abs(dot(n, V));
  vec3 col = vColor * vShade * (0.16 + 0.9 * diff);
  col += vec3(1.0, 0.4, 0.09) * (vHot * vHot * uCore * (0.35 + 0.65 * rim));
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Teksty programów silnika; `logDepth` — chunki logarytmicznej głębi (renderer mapy układu: `sceneDepthUnification`).
 * ARC CV-4a — do tego `bolt` i `mote` (język broni, flaga `cvWeapons`); `streak` i `spark` bez zmian.
 * ARC CV-5 — `blast` (wybuchy, dym, płomienie, fala — flaga `cvDamage`) i `debris` (odłamki).
 * @param {{ logDepth?: boolean }} [opts]
 * @returns {{ streak: { vertexShader: string, fragmentShader: string }, spark: { vertexShader: string, fragmentShader: string },
 *             bolt: { vertexShader: string, fragmentShader: string }, mote: { vertexShader: string, fragmentShader: string },
 *             blast: { vertexShader: string, fragmentShader: string }, debris: { vertexShader: string, fragmentShader: string } }}
 */
export function buildFxShaders({ logDepth = true } = {}) {
  const v = (s) => (logDepth ? withLogDepthVertex(s) : s);
  const f = (s) => (logDepth ? withLogDepthFragment(s) : s);
  return {
    streak: { vertexShader: v(STREAK_VERT), fragmentShader: f(STREAK_FRAG) },
    spark:  { vertexShader: v(SPARK_VERT),  fragmentShader: f(SPARK_FRAG) },
    bolt:   { vertexShader: v(BOLT_VERT),   fragmentShader: f(BOLT_FRAG) },
    mote:   { vertexShader: v(MOTE_VERT),   fragmentShader: f(MOTE_FRAG) },
    blast:  { vertexShader: v(BLAST_VERT),  fragmentShader: f(BLAST_FRAG) },
    debris: { vertexShader: v(DEBRIS_VERT), fragmentShader: f(DEBRIS_FRAG) },
  };
}
