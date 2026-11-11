// ShipLightPoints — klikane punkty świetlne statku (okna, światła pozycyjne): małe punkty HDR przyczepione do kadłuba
// (ARC COMBAT VISUALS, krok CV-1a; plan §2.11; flaga `cvModels`).
//
// Dla modeli właściciela to GŁÓWNA droga świecenia, nie zapas: tekstury Meshy nie mają cyjanowych okien (pomiar
// 2026-11-10 — jedyny cyjan to pierścień rdzenia warp), więc okna klika Workshop (CV-1c) jako `lights[]` pliku hardpointów.
// Rysowane ZAWSZE, gdy lista nie jest pusta — niezależnie od `keyColour.mode` (maska i punkty razem są poprawne).
//
// Budowa: jeden program na wszystkie statki (ShaderMaterial, wspólny); geometria INSTANCJONOWANA na slot (czworokąt +
// atrybuty instancji `aPos` / `aSize` / `aColor` w znormalizowanej przestrzeni modelu), wspólna dla wszystkich statków
// slotu; na statek JEDEN obiekt Mesh z PULI, dziecko grupy ramy kanonicznej (dziedziczy położenie, kurs, przechył i SKALĘ
// klasy — rozmiar świata = `size` × rozmiar klasy, z macierzy modelu w shaderze). Po rozgrzewce `acquire` / `release`
// nie tworzą żadnego obiektu Three.js.
//
// Statyczne: bez zegara i bez animacji — pauza nie ma czego zamrażać.
// WIDOCZNOŚĆ (Finding 684, kontrola właściciela 2026-11-11): punkt nigdy nie jest mniejszy niż `uMinPx` px na ekranie (podłoga
// — w kinie fregata ma 40–50 px, a punkt 0,03 długości to ~1,3 px, dawniej gasł do krycia ~0,9 · rozmiar / próg); gaśnie WYŁĄCZNIE
// z rozmiarem STATKU na ekranie — pełny od `uFadeHi` px długości statku, zero przy `uFadeLo` px (daleki widok taktyczny), więc
// z daleka nie rośnie w plamę większą od statku. Lustro w JS: `lightPointScreen` (keeper `cv_light_visibility_smoke`).
// Chunki logarytmicznej głębi (V-267): bez nich punkt pisałby głębię stałoprzecinkową i przegrywał z każdym kadłubem.
// Punkt jest przysunięty do kamery o pół swojego rozmiaru — leży NA powierzchni (Workshop klika powierzchnię), więc bez
// tego połowa czworokąta znikałaby w kadłubie, na którym jest namalowany; drugą stronę kadłuba dalej zasłania kadłub.

import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';
import { LIGHT_DEFAULTS } from '../data/ShipHardpointsSchema.js';

export const LIGHT_VERT = `
uniform float uPxToWorld;
uniform float uMinPx;
uniform float uGain;
uniform float uFadeLo;
uniform float uFadeHi;
attribute vec3 aPos;
attribute float aSize;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vPx;
void main() {
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float s = length(modelMatrix[0].xyz);
  float size = aSize * s;
  float depth = max(-mv.z, 1e-4);
  float pxW = max(uPxToWorld * depth, 1e-9);
  float shipPx = s / pxW;
  vAlpha = smoothstep(uFadeLo, max(uFadeHi, uFadeLo + 1e-3), shipPx);
  float drawn = max(size, uMinPx * pxW);
  vPx = drawn / pxW;
  vec3 toCam = normalize(vec3(0.0, 0.0, 1e-6) - mv.xyz);
  mv.xyz += toCam * min(0.5 * drawn, 0.5 * depth);
  mv.xy += position.xy * (0.5 * drawn);
  vUv = position.xy;
  vColor = aColor * uGain;
  gl_Position = projectionMatrix * mv;
}
`;

// Profil: duży punkt — rdzeń + blask (jasny środek, miękki brzeg); MAŁY punkt (średnica ≤ 3 px) — pełny dysk. Przy 2 px środki
// pikseli leżą w r ≈ 0,7, gdzie profil blasku daje ~1 % jasności środka — punkt na podłodze był niemal czarny (sonda GPU
// 2026-11-11: szczyt 2 / 255 przy kolorze 1,0). Przejście 3 → 8 px ciągłe (`smoothstep`).
export const LIGHT_FRAG = `
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
varying float vPx;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float glow = 1.0 - r;
  glow *= glow;
  float core = 1.0 - smoothstep(0.0, 0.35, r);
  float k = smoothstep(3.0, 8.0, vPx);
  gl_FragColor = vec4(vColor * mix(1.0, glow + core, k), vAlpha * mix(1.0, glow, k) * uOpacity);
}
`;

/** Teksty programu; `logDepth` — chunki logarytmicznej głębi (renderer mapy układu). */
export function buildLightShaders({ logDepth = true } = {}) {
  return {
    vertexShader: logDepth ? withLogDepthVertex(LIGHT_VERT) : LIGHT_VERT,
    fragmentShader: logDepth ? withLogDepthFragment(LIGHT_FRAG) : LIGHT_FRAG,
  };
}

/** '#rrggbb' sRGB → liniowe [r, g, b] (ta sama krzywa co Three.js ColorManagement). */
export function hexToLinear(hex) {
  const n = /^#?[0-9a-fA-F]{6}$/.test(String(hex)) ? parseInt(String(hex).replace('#', ''), 16) : 0x7ff4ff;
  const c = (v) => { const s = v / 255; return s <= 0.04045 ? s * 0.0773993808 : Math.pow(s * 0.9478672986 + 0.0521327014, 2.4); };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

const QUAD = [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 2, 1, 3];

// Wartości pierwszej klatki — renderer i Workshop przepisują je co klatkę z `LIVE_CV_FX` (`MODEL_LIGHT_*`).
export const LIVE_LIGHTS_DEFAULTS = Object.freeze({ gain: 2.0, minPx: 2.0, fadePx: 10, fadeEndPx: 5 });

/**
 * Lustro shadera w JS (keeper): rozmiar punktu i krycie na ekranie. Podłoga: narysowany punkt ≥ `minPx`; krycie zależy WYŁĄCZNIE
 * od długości statku na ekranie (smoothstep od `fadeEndPx` do `fadePx`), nie od rozmiaru samego punktu.
 * @param {{ size:number, shipLen:number, depth:number, pxToWorld:number, minPx?:number, fadePx?:number, fadeEndPx?:number }} a
 *   size — średnica w przestrzeni znormalizowanej (× długość statku); shipLen — długość statku w świecie; depth — głębia widoku;
 *   pxToWorld — świat na piksel przy głębi 1 (`2·tan(fov/2) / wysokość okna`)
 * @returns {{ shipPx:number, sizePx:number, drawnPx:number, alpha:number }}
 */
export function lightPointScreen({ size, shipLen, depth, pxToWorld, minPx = LIVE_LIGHTS_DEFAULTS.minPx, fadePx = LIVE_LIGHTS_DEFAULTS.fadePx, fadeEndPx = LIVE_LIGHTS_DEFAULTS.fadeEndPx }) {
  const pxW = Math.max(pxToWorld * Math.max(depth, 1e-4), 1e-9);
  const shipPx = shipLen / pxW;
  const sizePx = (size * shipLen) / pxW;
  const hi = Math.max(fadePx, fadeEndPx + 1e-3);
  const t = Math.min(1, Math.max(0, (shipPx - fadeEndPx) / (hi - fadeEndPx)));
  return { shipPx, sizePx, drawnPx: Math.max(sizePx, minPx), alpha: t * t * (3 - 2 * t) };
}

/**
 * Pula punktów świetlnych: geometria na klucz (slot), obiekty Mesh z puli. Każdy obiekt z puli ma WŁASNY materiał
 * (ten sam program — tekst shadera wspólny), którego uniformy rozmiaru / wzmocnienia są WSPÓLNYMI obiektami (jedna zmiana
 * na klatkę działa na wszystkie statki), a krycie jest własne: ścieżki krycia statku (wywiad — duch wroga, szarość
 * utrzymania) chodzą `traverse` po dzieciach i piszą `material.opacity` — przy materiale wspólnym przyciemniałyby światła
 * WSZYSTKICH statków. `onBeforeRender` przepisuje `material.opacity` do uniformu przy każdym rysowaniu (bez alokacji).
 */
export class LightPointPool {
  /** @param {{ THREE: object, logDepth?: boolean }} o */
  constructor({ THREE, logDepth = true } = {}) {
    if (!THREE?.InstancedBufferGeometry) throw new Error('[ShipLightPoints] wymagany THREE (r171) z InstancedBufferGeometry');
    this.THREE = THREE;
    this._src = buildLightShaders({ logDepth });
    this.shared = {
      uPxToWorld: { value: 0.001 }, uMinPx: { value: LIVE_LIGHTS_DEFAULTS.minPx }, uGain: { value: LIVE_LIGHTS_DEFAULTS.gain },
      uFadeHi: { value: LIVE_LIGHTS_DEFAULTS.fadePx }, uFadeLo: { value: LIVE_LIGHTS_DEFAULTS.fadeEndPx },
    };
    this._geoms = new Map();   // klucz → InstancedBufferGeometry
    this._free = [];
    this._live = new Set();
    this._created = 0;
    this._acquired = 0;
    this._noRaycast = () => {};
    this._syncOpacity = function (_r, _s, _c, _g, material) { material.uniforms.uOpacity.value = material.opacity; };
  }

  _makeMaterial() {
    const T = this.THREE;
    return new T.ShaderMaterial({
      uniforms: {
        uPxToWorld: this.shared.uPxToWorld, uMinPx: this.shared.uMinPx, uGain: this.shared.uGain,
        uFadeHi: this.shared.uFadeHi, uFadeLo: this.shared.uFadeLo, uOpacity: { value: 1 },
      },
      vertexShader: this._src.vertexShader, fragmentShader: this._src.fragmentShader,
      transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending,
    });
  }

  /**
   * Geometria dla listy świateł (pamięć na klucz — slot / wariant). Lista pusta ⇒ null.
   * @param {string} key
   * @param {Array<{p:number[], size:number, colour?:string, gain?:number}>} lights
   */
  geometryFor(key, lights) {
    if (!Array.isArray(lights) || lights.length === 0) return null;
    const have = this._geoms.get(key);
    if (have && have.userData.lightsRef === lights) return have;
    if (have) { have.dispose(); this._geoms.delete(key); }
    const T = this.THREE;
    const n = lights.length;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
    lights.forEach((l, i) => {
      pos.set(l.p, i * 3);
      size[i] = l.size > 0 ? l.size : LIGHT_DEFAULTS.size;
      const c = hexToLinear(l.colour ?? LIGHT_DEFAULTS.colour);
      const g = Number.isFinite(l.gain) ? l.gain : LIGHT_DEFAULTS.gain;
      col[i * 3] = c[0] * g; col[i * 3 + 1] = c[1] * g; col[i * 3 + 2] = c[2] * g;
    });
    const geo = new T.InstancedBufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(QUAD, 3));
    geo.setIndex(QUAD_INDEX);
    geo.setAttribute('aPos', new T.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aSize', new T.InstancedBufferAttribute(size, 1));
    geo.setAttribute('aColor', new T.InstancedBufferAttribute(col, 3));
    geo.instanceCount = n;
    // Sfera otaczająca w przestrzeni znormalizowanej (wszystkie punkty w |c| ≤ 1) — odrzucanie poza kadrem działa
    // per statek (bez niej Three liczyłby sferę z samego czworokąta w środku statku).
    geo.boundingSphere = new T.Sphere(new T.Vector3(0, 0, 0), 1.0);
    geo.userData.lightsRef = lights;
    this._geoms.set(key, geo);
    return geo;
  }

  /** Obiekt Mesh z puli dla geometrii (bez tworzenia po rozgrzewce). */
  acquire(geometry) {
    if (!geometry) return null;
    let mesh = this._free.pop();
    if (!mesh) {
      mesh = new this.THREE.Mesh(geometry, this._makeMaterial());
      mesh.raycast = this._noRaycast;   // klik w statek liczy się ekranowo od wrappera — punkty nie zmieniają pola kliku
      mesh.onBeforeRender = this._syncOpacity;
      mesh.renderOrder = 3;
      mesh.name = 'cvShipLights';
      this._created++;
    } else {
      mesh.geometry = geometry;
    }
    // Stan krycia z poprzedniego statku (pamięć ścieżek krycia w `userData`) — od zera.
    const m = mesh.material;
    m.opacity = 1; m.transparent = true;
    for (const k in m.userData) delete m.userData[k];   // bez nowego obiektu (pula nie alokuje po rozgrzewce)
    mesh.visible = true;
    this._live.add(mesh);
    this._acquired++;
    return mesh;
  }

  /** Zwróć do puli (odczepia od rodzica). */
  release(mesh) {
    if (!mesh || !this._live.has(mesh)) return;
    this._live.delete(mesh);
    mesh.removeFromParent?.();
    this._free.push(mesh);
  }

  /** Raz na klatkę: rozmiar piksela w świecie (głębia 1) i pokrętła (brak wartości — domyślne `LIVE_LIGHTS_DEFAULTS`). */
  update({ fovDeg = 55, viewportH = 1, gain = LIVE_LIGHTS_DEFAULTS.gain, minPx = LIVE_LIGHTS_DEFAULTS.minPx,
    fadePx = LIVE_LIGHTS_DEFAULTS.fadePx, fadeEndPx = LIVE_LIGHTS_DEFAULTS.fadeEndPx } = {}) {
    const u = this.shared;
    u.uPxToWorld.value = 2 * Math.tan((fovDeg * Math.PI / 180) / 2) / Math.max(1, viewportH);
    u.uGain.value = gain;
    u.uMinPx.value = minPx;
    u.uFadeHi.value = fadePx;
    u.uFadeLo.value = fadeEndPx;
  }

  stats() {
    return { created: this._created, acquired: this._acquired, live: this._live.size, free: this._free.length, geometries: this._geoms.size };
  }
}
