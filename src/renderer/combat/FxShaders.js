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

/**
 * Teksty programów silnika; `logDepth` — chunki logarytmicznej głębi (renderer mapy układu: `sceneDepthUnification`).
 * ARC CV-4a — do tego `bolt` i `mote` (język broni, flaga `cvWeapons`); `streak` i `spark` bez zmian.
 * @param {{ logDepth?: boolean }} [opts]
 * @returns {{ streak: { vertexShader: string, fragmentShader: string }, spark: { vertexShader: string, fragmentShader: string },
 *             bolt: { vertexShader: string, fragmentShader: string }, mote: { vertexShader: string, fragmentShader: string } }}
 */
export function buildFxShaders({ logDepth = true } = {}) {
  const v = (s) => (logDepth ? withLogDepthVertex(s) : s);
  const f = (s) => (logDepth ? withLogDepthFragment(s) : s);
  return {
    streak: { vertexShader: v(STREAK_VERT), fragmentShader: f(STREAK_FRAG) },
    spark:  { vertexShader: v(SPARK_VERT),  fragmentShader: f(SPARK_FRAG) },
    bolt:   { vertexShader: v(BOLT_VERT),   fragmentShader: f(BOLT_FRAG) },
    mote:   { vertexShader: v(MOTE_VERT),   fragmentShader: f(MOTE_FRAG) },
  };
}
