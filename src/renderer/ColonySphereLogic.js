// ColonySphereLogic — CZYSTA logika bohatera kuli kolonii (ARC COLONY SPHERE, krok CS-7; plan §2, §3.15, D-CS-11).
//
// Wszystko, co w `ColonySphereRenderer` da się policzyć bez WebGL: kamera i kadr, promień → pole (picking), rzut pola na
// ekran (znaczniki 2D), automat auto-obrotu, automat podmiany mapy (LOD → bohater), tempo klatek w bezczynności,
// geometria nakładki pól (komórki Voronoja środków pól) i tekstura stanu pól (id pola → barwy).
//
// ── Układ odniesienia ────────────────────────────────────────────────────────────────────
//  • Siatka kuli stoi w miejscu (przestrzeń obiektu = przestrzeń pola SurfaceField = środki pól GeodesicTopology):
//    „obrót kuli" to ruch KAMERY po długości / szerokości wokół ciała, a światło gwiazdy idzie za kamerą ze stałym
//    przesunięciem (ciało obraca się pod lampą). Dzięki temu picking nie potrzebuje żadnej macierzy modelu.
//  • kierunek(lon, lat) = (cos lat · cos lon, sin lat, cos lat · sin lon) — to samo odwzorowanie co mapa equirect
//    (SurfaceField.bakeEquirect / SurfaceShader.dirToUv).
//  • Ciało związane pływowo (`isStarLocked`): światło stoi w przestrzeni ciała (punkt podgwiezdny), obraca się kamera.
//
// Moduł BEZ importów three i bez efektów ubocznych — keeper `colony_sphere_hero_smoke` wykonuje go pod node.

import { surfaceSunColor } from './SurfaceShader.js';

const DEG = Math.PI / 180;

/** Pokrętła bohatera kuli (jeden obiekt — renderer, widok i keeper czytają te same liczby). */
export const SPHERE_TUNING = {
  fovDeg: 30,                 // pionowe pole widzenia kamery [°]
  fitFraction: 0.84,          // udział krótszego boku kadru zajęty przez tarczę przy pełnym oddaleniu
  zoomTilesAcross: 3.6,       // najbliższe zbliżenie: tyle pól mieści się w wysokości kadru
  zoomNearMin: 1.8,           // klamry najbliższej odległości kamery od środka kuli [promienie ciała]
  zoomNearMax: 3.2,
  zoomPerWheel: 0.0011,       // wykładnik zmiany odległości na jednostkę kółka (deltaY)
  zoomEasePerSec: 9,          // tempo dochodzenia do celu zoomu [1/s]
  pitchMaxDeg: 80,            // klamra szerokości kamery [°]
  spinRate: 0.03,             // auto-obrót [rad/s] (pełny obrót ≈ 3,5 min)
  resumeDelayMs: 1200,        // przerwa po zjechaniu myszy z kuli [ms]
  easeInMs: 1800,             // rozpędzanie auto-obrotu [ms]
  turnMs: 650,                // obrót do pola po dwukliku [ms]
  crossFadeMs: 450,           // przenikanie mapa LOD → mapa bohatera [ms]
  sunAzimuthDeg: 48,          // gwiazda na lewo od osi widzenia [°] — terminator w kadrze, środek tarczy w dzień
  sunElevationDeg: 14,        // gwiazda ponad osią widzenia [°]
  nightFill: [0.075, 0.085, 0.105],   // miękkie dopełnienie nocy (liniowe, dodawane do ambientu układu)
  hazeMax: 0.35,              // pokłady Wenus / Tytana rozrzedzone w widoku kolonii (hazeOpacity ≤ tyle)
  cloudAlphaWork: 0.4,        // mnożnik krycia chmur przy trybie budowy / soczewce (teren ma być czytelny)
  fpsSpin: 30,                // klatki/s podczas auto-obrotu
  fpsWeather: 10,             // klatki/s, gdy zmienia się tylko pogoda
  gridCursorTiles: 2.3,       // promień siatki przy kursorze [odstępy pól]
  overlayRadius: 1.0015,      // promień nakładki pól [promienie ciała]
  sphereSegments: [128, 96],  // podział siatki kuli (gładki limb przy dużej tarczy)
};

// ── Lustro stałych światła ThreeRenderer (mapa układu). Kule mają wyglądać tak samo na obu ekranach — keeper pilnuje
//    źródłowo, że liczby zgadzają się z ThreeRenderer (PointLight gwiazdy, wykładnik jasności, ambient, ekspozycja).
export const SPHERE_LIGHT = Object.freeze({
  base: 2.8, lumExp: 0.22, ambientHex: 0x101a26, ambientCoolHex: 0x0a1c4d, ambientCoolMix: 0.6, ambientIntensity: 0.4,
  exposure: 1.12, defaultStarHex: 0xfff1de, coolClasses: Object.freeze(['M', 'K']),
});

function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hexLinear(hex) {
  const n = hex >>> 0;
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

/**
 * Światło kuli kolonii z gwiazdy układu: barwa słońca dla SurfaceShader (jak mapa układu: `surfaceSunColor`) i ambient
 * układu + dopełnienie nocy.
 * @param {{colorHex?:number, spectralType?:string, luminosity?:number}} star
 * @returns {{sun:number[], ambient:number[]}}
 */
export function sphereLight(star = {}, T = SPHERE_TUNING) {
  const L = SPHERE_LIGHT;
  const c = hexLinear(Number.isFinite(star.colorHex) ? star.colorHex : L.defaultStarHex);
  const lum = Math.max(Number.isFinite(star.luminosity) ? star.luminosity : 1, 1e-6);
  const sun = surfaceSunColor(c[0], c[1], c[2], L.base * Math.pow(lum, L.lumExp));
  const a = hexLinear(L.ambientHex);
  if (L.coolClasses.includes(star.spectralType)) {
    const b = hexLinear(L.ambientCoolHex);
    for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * L.ambientCoolMix;
  }
  const k = L.ambientIntensity / Math.PI;
  return { sun, ambient: [a[0] * k + T.nightFill[0], a[1] * k + T.nightFill[1], a[2] * k + T.nightFill[2]] };
}

// ── Kierunki i kamera ───────────────────────────────────────────────────────────────────

export function dirOf(lon, lat, out = [0, 0, 0]) {
  const cl = Math.cos(lat);
  out[0] = cl * Math.cos(lon); out[1] = Math.sin(lat); out[2] = cl * Math.sin(lon);
  return out;
}

/** Długość i szerokość kierunku [rad]. */
export function lonLatOf(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [Math.atan2(z, x), Math.asin(Math.max(-1, Math.min(1, y / l)))];
}

export function clampLat(lat, T = SPHERE_TUNING) {
  const m = T.pitchMaxDeg * DEG;
  return lat > m ? m : (lat < -m ? -m : lat);
}

/** Najkrótsza różnica długości b − a w (−π, π]. */
export function shortestLonDelta(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Baza kamery patrzącej z (lon, lat, dist) na środek kuli, góra = +Y (to samo co three `lookAt` z `up = (0,1,0)`).
 * @returns {{pos:number[], fwd:number[], right:number[], up:number[]}}
 */
export function cameraBasis(view) {
  const d = dirOf(view.lon, view.lat);
  const pos = [d[0] * view.dist, d[1] * view.dist, d[2] * view.dist];
  const fwd = [-d[0], -d[1], -d[2]];
  // right = fwd × (0,1,0)
  let rx = -fwd[2], rz = fwd[0];
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const right = [rx, 0, rz];
  // up = right × fwd
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { pos, fwd, right, up };
}

/** Odległość kamery, przy której tarcza kuli (promień 1) zajmuje `fit` krótszego boku kadru. */
export function fitDistance(aspect, T = SPHERE_TUNING) {
  const tanA = T.fitFraction * Math.tan(T.fovDeg * DEG / 2) * Math.min(1, aspect);
  return Math.sqrt(1 + 1 / (tanA * tanA));   // d = 1 / sin(atan(tanA))
}

/** Zakres zoomu dla siatki o `count` polach: { near, far } (odległość kamery od środka kuli). */
export function zoomRange(count, aspect, T = SPHERE_TUNING) {
  const far = fitDistance(aspect, T);
  const spacing = Math.sqrt(4 * Math.PI / Math.max(12, count));   // średni odstęp pól [rad]
  let near = 1 + (T.zoomTilesAcross * spacing) / (2 * Math.tan(T.fovDeg * DEG / 2));
  near = Math.max(T.zoomNearMin, Math.min(T.zoomNearMax, near));
  return { near: Math.min(near, far), far };
}

/** Kółko myszy → nowy cel odległości (wykładniczo, w klamrach zakresu). delta > 0 = oddalenie. */
export function applyWheel(dist, delta, range, T = SPHERE_TUNING) {
  const d = dist * Math.exp(delta * T.zoomPerWheel);
  return Math.max(range.near, Math.min(range.far, d));
}

/**
 * Przeciągnięcie myszą o (dxPx, dyPx) przy kadrze o wysokości `viewHPx`: kula „idzie za ręką" — kąt na piksel liczony
 * z rozmiaru tarczy w środku kadru. Zwraca nowe { lon, lat }.
 */
export function applyDrag(view, dxPx, dyPx, viewHPx, T = SPHERE_TUNING) {
  const k = (2 * (view.dist - 1) * Math.tan(T.fovDeg * DEG / 2)) / Math.max(1, viewHPx);   // [rad / px] w punkcie pod kamerą
  return { lon: view.lon + dxPx * k, lat: clampLat(view.lat + dyPx * k, T) };
}

/** Promień widzenia przez punkt kadru (nx, ny ∈ [−1, 1], y w górę): { o, d } w przestrzeni kuli. */
export function screenRay(view, aspect, nx, ny, T = SPHERE_TUNING) {
  const b = cameraBasis(view);
  const th = Math.tan(T.fovDeg * DEG / 2);
  const sx = nx * th * aspect, sy = ny * th;
  const d = [b.fwd[0] + b.right[0] * sx + b.up[0] * sy, b.fwd[1] + b.right[1] * sx + b.up[1] * sy, b.fwd[2] + b.right[2] * sx + b.up[2] * sy];
  const l = Math.hypot(d[0], d[1], d[2]);
  d[0] /= l; d[1] /= l; d[2] /= l;
  return { o: b.pos, d };
}

/** Bliższe przecięcie promienia z kulą o promieniu r wokół zera: punkt [x, y, z] albo null. */
export function raySphere(o, d, r = 1) {
  const bq = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const cq = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const disc = bq * bq - cq;
  if (disc < 0) return null;
  const t = -bq - Math.sqrt(disc);
  if (t <= 0) return null;
  return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
}

/** Punkt kuli pod punktem kadru (kierunek jednostkowy) albo null, gdy kursor jest poza tarczą. */
export function pickDir(view, aspect, nx, ny, T = SPHERE_TUNING) {
  const ray = screenRay(view, aspect, nx, ny, T);
  return raySphere(ray.o, ray.d, 1);
}

/** Pole o środku najbliższym kierunkowi (x, y, z) — DOKŁADNE: komórki nakładki to komórki Voronoja środków. */
export function nearestTile(topo, x, y, z) {
  const { cx, cy, cz, count } = topo;
  let best = -1, bd = -Infinity;
  for (let i = 0; i < count; i++) {
    const d = cx[i] * x + cy[i] * y + cz[i] * z;
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

/** Punkt kadru → indeks pola (−1 poza tarczą). */
export function pickTile(topo, view, aspect, nx, ny, T = SPHERE_TUNING) {
  const p = pickDir(view, aspect, nx, ny, T);
  return p ? nearestTile(topo, p[0], p[1], p[2]) : -1;
}

/**
 * Rzut punktu kuli (kierunek jednostkowy × r) na kadr: { nx, ny } w [−1, 1] (y w górę), `front` = punkt po widocznej
 * stronie kuli (nie za horyzontem), `facing` = cos kąta między normalną a kierunkiem do kamery (1 = pod kamerą).
 */
export function projectDir(view, aspect, x, y, z, r = 1, T = SPHERE_TUNING) {
  const b = cameraBasis(view);
  const px = x * r - b.pos[0], py = y * r - b.pos[1], pz = z * r - b.pos[2];
  const depth = px * b.fwd[0] + py * b.fwd[1] + pz * b.fwd[2];
  const th = Math.tan(T.fovDeg * DEG / 2);
  const sx = (px * b.right[0] + py * b.right[1] + pz * b.right[2]) / (depth * th * aspect);
  const sy = (px * b.up[0] + py * b.up[1] + pz * b.up[2]) / (depth * th);
  const pl = Math.hypot(px, py, pz) || 1;
  const facing = -(px * x + py * y + pz * z) / pl;
  const front = (x * b.pos[0] + y * b.pos[1] + z * b.pos[2]) > 1;   // horyzont kuli jednostkowej: p̂ · P = 1
  return { nx: sx, ny: sy, front: front && depth > 0, facing };
}

/** Promień tarczy kuli w kadrze (jednostki NDC osi y). */
export function discRadiusNdc(view, T = SPHERE_TUNING) {
  const s = 1 / view.dist;
  return (s / Math.sqrt(1 - s * s)) / Math.tan(T.fovDeg * DEG / 2);
}

/** Kierunek do gwiazdy w przestrzeni kuli: za kamerą ze stałym przesunięciem albo stały punkt podgwiezdny (związane pływowo). */
export function sunDirFor(view, lockedDir = null, T = SPHERE_TUNING) {
  if (lockedDir) return [lockedDir[0], lockedDir[1], lockedDir[2]];
  // Przesunięcie liczone w układzie KAMERY (w lewo o azymut, w górę o elewację), nie względem równika ciała: stolica
  // przy biegunie też jest w dzień, a terminator stoi w tym samym miejscu kadru przy każdej szerokości.
  const b = cameraBasis(view);
  const az = T.sunAzimuthDeg * DEG, el = T.sunElevationDeg * DEG;
  const f = -Math.cos(az) * Math.cos(el), r = -Math.sin(az) * Math.cos(el), u = Math.sin(el);
  return [b.fwd[0] * f + b.right[0] * r + b.up[0] * u, b.fwd[1] * f + b.right[1] * r + b.up[1] * u, b.fwd[2] * f + b.right[2] * r + b.up[2] * u];
}

/** Widok startowy nad polem (środek pola) — kamera patrzy prosto na nie, w klamrach szerokości. */
export function viewOver(x, y, z, dist, T = SPHERE_TUNING) {
  const [lon, lat] = lonLatOf(x, y, z);
  return { lon, lat: clampLat(lat, T), dist };
}

/** Krok obrotu do pola: p ∈ [0, 1] → { lon, lat } po najkrótszym łuku długości, z wygładzeniem (smoothstep). */
export function turnStep(from, to, p) {
  const q = p <= 0 ? 0 : (p >= 1 ? 1 : p * p * (3 - 2 * p));
  return { lon: from.lon + shortestLonDelta(from.lon, to.lon) * q, lat: from.lat + (to.lat - from.lat) * q };
}

// ── Automat auto-obrotu (decyzja właściciela 3) ───────────────────────────────────────────────────
//  spin  — kula obraca się (factor 1)
//  hold  — kursor nad kulą / przeciąganie / blokada (zaznaczone pole albo tryb budowy): factor 0
//  wait  — kursor zjechał, odliczamy `resumeDelayMs`
//  ease  — rozpędzanie przez `easeInMs` (factor 0 → 1, kwadratowo)

export const SPIN_MODE = Object.freeze({ SPIN: 'spin', HOLD: 'hold', WAIT: 'wait', EASE: 'ease' });

export function createSpin(now = 0) { return { mode: SPIN_MODE.SPIN, since: now, factor: 1 }; }

/**
 * Jeden krok automatu.
 * @param {{mode:string, since:number, factor:number}} s
 * @param {{now:number, hover:boolean, dragging:boolean, locked:boolean}} input `locked` = zaznaczone pole albo tryb budowy
 */
export function stepSpin(s, input, T = SPHERE_TUNING) {
  const { now } = input;
  if (input.locked || input.hover || input.dragging) return s.mode === SPIN_MODE.HOLD ? s : { mode: SPIN_MODE.HOLD, since: now, factor: 0 };
  switch (s.mode) {
    case SPIN_MODE.HOLD: return { mode: SPIN_MODE.WAIT, since: now, factor: 0 };
    case SPIN_MODE.WAIT: return now - s.since >= T.resumeDelayMs ? { mode: SPIN_MODE.EASE, since: now, factor: 0 } : s;
    case SPIN_MODE.EASE: {
      const p = (now - s.since) / Math.max(1, T.easeInMs);
      return p >= 1 ? { mode: SPIN_MODE.SPIN, since: now, factor: 1 } : { mode: SPIN_MODE.EASE, since: s.since, factor: p * p };
    }
    default: return s;
  }
}

// ── Automat mapy powierzchni (LOD natychmiast → bohater z przenikaniem) ──────────────────────────────────
//  none  — barwa zastępcza archetypu (żadnej mapy)
//  lod   — powiększona mapa LOD mapy układu
//  cross — przenikanie LOD → bohater (crossFadeMs)
//  hero  — mapa bohatera 1024×512

export const MAP_PHASE = Object.freeze({ NONE: 'none', LOD: 'lod', CROSS: 'cross', HERO: 'hero' });

/**
 * Co zrobić przy bieżącej fazie i dostępnych mapach.
 * @param {string} phase
 * @param {{lod:boolean, hero:boolean, crossDone?:boolean}} has
 * @returns {{phase:string, action:null|'show-lod'|'show-hero'|'cross-to-hero'|'finish-cross'}}
 */
export function mapSwapStep(phase, has) {
  if (phase === MAP_PHASE.NONE) {
    if (has.hero) return { phase: MAP_PHASE.HERO, action: 'show-hero' };       // bohater już w cache — bez etapu LOD
    if (has.lod) return { phase: MAP_PHASE.LOD, action: 'show-lod' };
    return { phase, action: null };
  }
  if (phase === MAP_PHASE.LOD) return has.hero ? { phase: MAP_PHASE.CROSS, action: 'cross-to-hero' } : { phase, action: null };
  if (phase === MAP_PHASE.CROSS) return has.crossDone ? { phase: MAP_PHASE.HERO, action: 'finish-cross' } : { phase, action: null };
  return { phase, action: null };
}

/** Postęp przenikania 0…1 (liniowo w czasie; wygładzenie robi wołający). */
export function crossProgress(t0, now, ms = SPHERE_TUNING.crossFadeMs) {
  if (t0 == null) return 1;
  const p = (now - t0) / Math.max(1, ms);
  return p <= 0 ? 0 : (p >= 1 ? 1 : p);
}

// ── Tempo klatek (render na żądanie) ───────────────────────────────────────────────────────────

/**
 * Odstęp między renderami [ms] bez „brudnego" stanu: 0 = każda klatka (interakcja / animacja), ∞ = nie renderuj.
 * @param {{interactive:boolean, spinFactor:number, weather:boolean}} st `weather` = chmury zmieniają się w czasie
 */
export function frameIntervalMs(st, T = SPHERE_TUNING) {
  if (st.interactive) return 0;
  if (st.spinFactor > 0) return 1000 / T.fpsSpin;
  if (st.weather) return 1000 / T.fpsWeather;
  return Infinity;
}

/** Czy renderować tę klatkę. `tolMs` — luz na drgania rAF (klatka 16,6 ms nie może zgubić co drugiego okna 33 ms). */
export function shouldRenderFrame({ dirty, sinceLastMs, intervalMs }, tolMs = 2) {
  if (dirty) return true;
  if (!Number.isFinite(intervalMs)) return false;
  return sinceLastMs + tolMs >= intervalMs;
}

/** Nieprzezroczystość pokładu / mgły w widoku kolonii: Wenus i Tytan rozrzedzone, cieńsze zasłony bez zmian. */
export function colonyHaze(hazeOpacity, T = SPHERE_TUNING) {
  return Number.isFinite(hazeOpacity) ? Math.min(hazeOpacity, T.hazeMax) : hazeOpacity;
}

// ── Geometria nakładki pól ──────────────────────────────────────────────────────────────────
// Narożnik komórki = kierunek środka okręgu opisanego na trójkącie (pole, sąsiad j, sąsiad j+1): punkt równoodległy od
// trzech środków. Komórki są więc DOKŁADNIE komórkami Voronoja środków pól — `nearestTile` zgadza się z rysunkiem na
// samych granicach. Krawędź między narożnikami j−1 i j jest wspólna z sąsiadem j (kolejność sąsiadów przeciwnie do zegara).

function circumDir(ax, ay, az, bx, by, bz, cx, cy, cz, out, o) {
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  const s = (nx * (ax + bx + cx) + ny * (ay + by + cy) + nz * (az + bz + cz)) < 0 ? -1 / l : 1 / l;
  out[o] = nx * s; out[o + 1] = ny * s; out[o + 2] = nz * s;
}

const _meshCache = new WeakMap();

/**
 * Siatka nakładki pól dla topologii (buforowana per topologia). Trójkąty wachlarza: (środek pola, narożnik j−1, narożnik j).
 * @returns {{count:number, tris:number, position:Float32Array, tile:Float32Array, edge:Float32Array, slot:Float32Array,
 *   cornerStart:Uint32Array, corners:Float32Array}}
 *   position — 3 wierzchołki × trójkąt (kierunki jednostkowe); tile — indeks pola; edge — 0 w środku, 1 na krawędzi;
 *   slot — numer krawędzi (= numer sąsiada, z którym jest wspólna); corners / cornerStart — narożniki pól (CSR, jak nbStart).
 */
export function buildTileMesh(topo) {
  const hit = _meshCache.get(topo);
  if (hit) return hit;
  const { count, cx, cy, cz, nbStart, nbList } = topo;
  const total = nbStart[count];
  const corners = new Float32Array(total * 3);
  const cornerStart = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) {
    const s = nbStart[i], k = nbStart[i + 1] - s;
    cornerStart[i] = s;
    for (let j = 0; j < k; j++) {
      const a = nbList[s + j], b = nbList[s + (j + 1) % k];
      circumDir(cx[i], cy[i], cz[i], cx[a], cy[a], cz[a], cx[b], cy[b], cz[b], corners, (s + j) * 3);
    }
  }
  cornerStart[count] = total;
  const position = new Float32Array(total * 9), tile = new Float32Array(total * 3), edge = new Float32Array(total * 3),
    slot = new Float32Array(total * 3);
  let v = 0;
  for (let i = 0; i < count; i++) {
    const s = nbStart[i], k = nbStart[i + 1] - s;
    for (let j = 0; j < k; j++) {
      const c0 = (s + (j + k - 1) % k) * 3, c1 = (s + j) * 3;
      position[v * 3] = cx[i]; position[v * 3 + 1] = cy[i]; position[v * 3 + 2] = cz[i];
      position[v * 3 + 3] = corners[c0]; position[v * 3 + 4] = corners[c0 + 1]; position[v * 3 + 5] = corners[c0 + 2];
      position[v * 3 + 6] = corners[c1]; position[v * 3 + 7] = corners[c1 + 1]; position[v * 3 + 8] = corners[c1 + 2];
      tile[v] = i; tile[v + 1] = i; tile[v + 2] = i;
      edge[v] = 0; edge[v + 1] = 1; edge[v + 2] = 1;
      slot[v] = j; slot[v + 1] = j; slot[v + 2] = j;
      v += 3;
    }
  }
  const mesh = { count, tris: total, position, tile, edge, slot, cornerStart, corners };
  _meshCache.set(topo, mesh);
  return mesh;
}

/** Narożniki pola i jako tablica [x, y, z] (kolejność przeciwnie do zegara, patrząc z zewnątrz). */
export function tileCorners(topo, i) {
  const m = buildTileMesh(topo);
  const out = [];
  for (let c = m.cornerStart[i]; c < m.cornerStart[i + 1]; c++) out.push([m.corners[c * 3], m.corners[c * 3 + 1], m.corners[c * 3 + 2]]);
  return out;
}

// ── Tekstura stanu pól (id pola → barwy; szerokość = liczba pól, 3 wiersze RGBA8) ─────────────────────────────
//  wiersz 0 — wypełnienie pola (RGBA)
//  wiersz 1 — obrys pola (RGBA)
//  wiersz 2 — R: maska krawędzi granicznych (bit j = krawędź wspólna z sąsiadem j), G: szerokość obrysu [px × 16],
//             B: styl wypełnienia (0 pełne, 255 kreskowanie), A: barwa granicy — indeks roli (0 własna, 255 obca)

export const OVERLAY_ROWS = 3;

export function createOverlayData(count) { return new Uint8Array(count * OVERLAY_ROWS * 4); }

const byte = (v) => (v <= 0 ? 0 : (v >= 255 ? 255 : Math.round(v)));

/**
 * Wpisz stan pola do tekstury.
 * @param {Uint8Array} data
 * @param {number} count liczba pól (szerokość tekstury)
 * @param {number} i indeks pola
 * @param {{fill?:number[], line?:number[], lineWidth?:number, borderMask?:number, hatch?:boolean, foreign?:boolean}} st
 *   barwy [r, g, b, a] w 0…255; `lineWidth` w px (0…15,9)
 */
export function writeOverlayTile(data, count, i, st = {}) {
  const f = st.fill, l = st.line;
  let o = i * 4;
  data[o] = byte(f?.[0] ?? 0); data[o + 1] = byte(f?.[1] ?? 0); data[o + 2] = byte(f?.[2] ?? 0); data[o + 3] = byte(f?.[3] ?? 0);
  o = (count + i) * 4;
  data[o] = byte(l?.[0] ?? 0); data[o + 1] = byte(l?.[1] ?? 0); data[o + 2] = byte(l?.[2] ?? 0); data[o + 3] = byte(l?.[3] ?? 0);
  o = (2 * count + i) * 4;
  data[o] = (st.borderMask ?? 0) & 63;
  data[o + 1] = byte((st.lineWidth ?? 1.5) * 16);
  data[o + 2] = st.hatch ? 255 : 0;
  data[o + 3] = st.foreign ? 255 : 0;
}

/** Maska krawędzi granicznych pola: bit j ustawiony, gdy `sameGroup(i, sąsiad j)` jest fałszem. */
export function borderMaskOf(topo, i, sameGroup) {
  const s = topo.nbStart[i], k = topo.nbStart[i + 1] - s;
  let mask = 0;
  for (let j = 0; j < k; j++) if (!sameGroup(i, topo.nbList[s + j])) mask |= (1 << j);
  return mask;
}

export const ColonySphereLogic = {
  SPHERE_TUNING, SPHERE_LIGHT, SPIN_MODE, MAP_PHASE, OVERLAY_ROWS,
  sphereLight, dirOf, lonLatOf, clampLat, shortestLonDelta, cameraBasis, fitDistance, zoomRange, applyWheel, applyDrag,
  screenRay, raySphere, pickDir, nearestTile, pickTile, projectDir, discRadiusNdc, sunDirFor, viewOver, turnStep,
  createSpin, stepSpin, mapSwapStep, crossProgress, frameIntervalMs, shouldRenderFrame, colonyHaze,
  buildTileMesh, tileCorners, createOverlayData, writeOverlayTile, borderMaskOf,
};
