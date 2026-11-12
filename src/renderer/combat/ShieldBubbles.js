// ShieldBubbles — PULA BANIEK OSŁON (ARC COMBAT VISUALS, krok CV-4b; plan §2.4, §2.10; flaga `cvShields`).
//
// Stała pula siatek (budowana RAZ — rozgrzewka; po niej zero obiektów THREE): jedna geometria sfery jednostkowej (dwudziestościan,
// podział 4), materiał na slot (ten sam tekst shadera — JEDEN program; wartości na bańkę wyłącznie uniformami). Renderer co klatkę
// przypisuje slot statkowi, ustawia przekształcenie (pozycja sprite'a, kwaternion sprite'a × ramy kanonicznej, skala = rozmiar statku
// × półosie bańki — `ShieldLogic.bubbleAxes`) i uniformy stanu (`ShieldLogic.ShieldStates.visual`). Bańka bez stanu — ukryta.
//
// Shader: fresnel krawędzi (lekki bloom — kolor osłony × SHD_RIM ponad progiem 1,0 tylko na samej krawędzi tuż po trafieniu), komórki
// (Worley 3D na sferze bańki — krawędzie komórek zapalają się przy fali i krawędzi), FALE z tablicy uniformów (kierunek na sferze +
// wiek; czoło rozchodzi się po kącie geodezyjnym od punktu trafienia, błysk w punkcie trafienia), słaba osłona — migotanie komórek,
// fala regeneracji (pas przesuwający się wzdłuż osi bańki), ROZPAD (błysk, komórki gasnące w swoich chwilach — rozszerzenie bańki
// ustawia renderer skalą). Mieszanie addytywne, bez zapisu głębi, obie strony (tylna przygaszona — fala z drugiej strony widać przez
// bańkę). Chunki logarytmicznej głębi jak cały silnik FX (V-267).
//
// ⚠ THREE wstrzykiwany — moduł wykonuje się pod node na prawdziwym Three.js r171 (keeper liczy konstrukcje po rozgrzewce).
// ⚠ Losowości tu nie ma (komórki — skrót położenia; ziarno komórek bańki z id statku podaje renderer). Nigdy `Math` losujący.

import { withLogDepthVertex, withLogDepthFragment } from '../LogDepthChunks.js';
import { SHIELD_RIPPLES_MAX } from './ShieldLogic.js';

/** Pojemność puli — 10 na 10 z osłonami = do 20 baniek naraz, z zapasem; pełna pula — slot NAJDAWNIEJ użyty (`steals`). */
export const SHIELD_BUBBLE_CAPACITY = 24;
/** Kolor osłony (semantyczny — `CombatFxConfig.FX_SHIELD_COLOR`), sRGB hex. */
const SHIELD_HEX = 0x66ccff;

export const BUBBLE_VERT = `
varying vec3 vSph;
varying vec3 vN;
varying vec3 vV;
void main() {
  vSph = normalize(position);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const BUBBLE_FRAG = `
uniform vec3 uColor;
uniform float uCore;
uniform float uRim;
uniform float uRimPow;
uniform float uBack;
uniform float uShell;
uniform float uCell;
uniform float uCellGain;
uniform float uRipMs;
uniform float uRipSpeed;
uniform float uRipWidth;
uniform float uFlickHz;
uniform float uColMs;
uniform float uColFlash;
uniform float uShMs;
uniform float uTimeS;
uniform vec4 uRip[${SHIELD_RIPPLES_MAX}];
uniform float uRipAmp[${SHIELD_RIPPLES_MAX}];
uniform float uCount;
uniform float uFade;
uniform float uBright;
uniform float uFlicker;
uniform float uCrisp;
uniform float uCol;
uniform float uSh;
uniform float uShGain;
uniform float uSeed;
varying vec3 vSph;
varying vec3 vN;
varying vec3 vV;
float bHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec2 bCells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 c = i + g;
        vec3 o = vec3(bHash(c), bHash(c + 19.19), bHash(c + 47.47));
        vec3 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; id = bHash(c + 3.3); }
        else if (d < f2) { f2 = d; }
      }
    }
  }
  return vec2(sqrt(f2) - sqrt(f1), id);
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float nv = abs(dot(n, v));
  float fres = pow(1.0 - nv, uRimPow);
  float face = gl_FrontFacing ? 1.0 : uBack;
  float e = 0.0;
  float ringE = 0.0;
  float w = mix(1.8, 1.0, uCrisp) * uRipWidth;
  for (int i = 0; i < ${SHIELD_RIPPLES_MAX}; i++) {
    if (float(i) >= uCount) break;
    vec4 r = uRip[i];
    if (r.w < 0.0 || r.w >= uRipMs) continue;
    float a = r.w / uRipMs;
    float ang = acos(clamp(dot(vSph, r.xyz), -1.0, 1.0));
    float front = uRipSpeed * r.w * 0.001;
    float ring = exp(-pow((ang - front) / w, 2.0)) * pow(1.0 - a, 1.5);
    float spot = exp(-pow(ang / 0.16, 2.0)) * exp(-r.w / 70.0) * 1.4;
    float glow = exp(-ang * 7.0) * (1.0 - a) * 0.22;
    e += uRipAmp[i] * (ring + spot + glow);
    ringE += uRipAmp[i] * ring;
  }
  vec2 c = bCells(vSph * uCell + vec3(uSeed, uSeed * 0.37, uSeed * 0.71));
  float edge = 1.0 - smoothstep(0.02, 0.09, c.x);
  float fl = 1.0 - uFlicker * 0.65 * (0.5 + 0.5 * sin(uTimeS * uFlickHz * 6.2831853 + c.y * 6.2831853));
  float shell = uFade * (uRim * fres + uShell);
  float cells = edge * uCellGain * (0.3 * uFade * fres + 0.9 * clamp(ringE, 0.0, 1.5));
  float sh = 0.0;
  if (uSh >= 0.0 && uSh < uShMs) {
    float t = uSh / uShMs;
    float band = exp(-pow((vSph.y - mix(-1.25, 1.25, t)) / 0.16, 2.0));
    sh = uShGain * band * (1.0 - t) * (0.6 + 0.8 * edge + 0.6 * fres);
  }
  float col = 0.0;
  if (uCol >= 0.0 && uCol < uColMs) {
    float t = uCol / uColMs;
    float flash = uColFlash * exp(-uCol / 70.0) * (0.25 + 0.75 * fres + 0.5 * edge);
    float die = c.y * 0.75;
    float alive = 1.0 - smoothstep(die, die + 0.25, t);
    col = flash + alive * (0.55 * edge + 0.03) * (1.0 - t) * (0.5 + 0.5 * fres);
    shell *= 1.0 - t;
  }
  vec3 outc = uColor * ((shell + uCore * e + cells) * uBright * fl + sh + col) * face;
  gl_FragColor = vec4(outc, 1.0);
}
`;

export class ShieldBubblePool {
  /**
   * @param {{ THREE: object, parent: object, logDepth?: boolean, capacity?: number }} o
   */
  constructor({ THREE, parent, logDepth = true, capacity = SHIELD_BUBBLE_CAPACITY } = {}) {
    if (!THREE?.IcosahedronGeometry) throw new Error('[ShieldBubbles] wymagany THREE (r171)');
    this.THREE = THREE;
    this.capacity = Math.max(1, Math.floor(capacity));
    this.root = new THREE.Group();
    this.root.name = 'cvShieldBubbles';
    parent?.add?.(this.root);
    this.geometry = new THREE.IcosahedronGeometry(1, 4);
    const vs = logDepth ? withLogDepthVertex(BUBBLE_VERT) : BUBBLE_VERT;
    const fs = logDepth ? withLogDepthFragment(BUBBLE_FRAG) : BUBBLE_FRAG;
    // Uniformy wspólne (pokrętła SHD_*) — TE SAME obiekty we wszystkich materiałach: jedno przepisanie na klatkę.
    this.shared = {
      uColor: { value: new THREE.Color(SHIELD_HEX) }, uCore: { value: 1.5 }, uRim: { value: 2.0 }, uRimPow: { value: 6 }, uBack: { value: 0.35 },
      uShell: { value: 0 },
      uCell: { value: 6.5 }, uCellGain: { value: 0.55 }, uRipMs: { value: 720 }, uRipSpeed: { value: 2.6 }, uRipWidth: { value: 0.085 },
      uFlickHz: { value: 11 }, uColMs: { value: 900 }, uColFlash: { value: 1.8 }, uShMs: { value: 650 }, uTimeS: { value: 0 },
    };
    this.slots = [];
    for (let i = 0; i < this.capacity; i++) {
      const u = {
        ...this.shared,
        uRip: { value: new Float32Array(4 * SHIELD_RIPPLES_MAX).fill(-1) }, uRipAmp: { value: new Float32Array(SHIELD_RIPPLES_MAX) },
        uCount: { value: SHIELD_RIPPLES_MAX }, uFade: { value: 0 }, uBright: { value: 1 }, uFlicker: { value: 0 }, uCrisp: { value: 1 },
        uCol: { value: -1 }, uSh: { value: -1 }, uShGain: { value: 0 }, uSeed: { value: 0 },
      };
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
        depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.name = 'cvShieldBubble_' + i;
      mesh.visible = false;
      mesh.renderOrder = 2;
      mesh.raycast = () => {};   // bańka nie łapie kliku
      this.root.add(mesh);
      this.slots.push({ mesh, u, owner: null, lastUse: -Infinity });
    }
    this.byOwner = new Map();
    this.peak = 0;
    this.steals = 0;
    this.acquired = 0;
  }

  /** Slot statku `id` (ten sam, dopóki go trzyma); nowy — wolny albo NAJDAWNIEJ użyty (`steals`). */
  acquire(id, now) {
    let s = this.byOwner.get(id);
    if (s) { s.lastUse = now; return s; }
    s = this.slots.find((x) => x.owner == null) ?? null;
    if (!s) {
      s = this.slots[0];
      for (const x of this.slots) if (x.lastUse < s.lastUse) s = x;
      this.byOwner.delete(s.owner);
      this.steals++;
    }
    s.owner = id;
    s.lastUse = now;
    s.mesh.visible = false;
    s.u.uRip.value.fill(-1);
    this.byOwner.set(id, s);
    this.acquired++;
    const n = this.byOwner.size;
    if (n > this.peak) this.peak = n;
    return s;
  }

  /** Zwolnij slot statku (bańka znika od tej klatki). */
  release(id) {
    const s = this.byOwner.get(id);
    if (!s) return;
    s.mesh.visible = false;
    s.owner = null;
    this.byOwner.delete(id);
  }

  has(id) { return this.byOwner.has(id); }

  owners() { return [...this.byOwner.keys()]; }

  /** Rozgrzewka: program bańki skompilowany przed pierwszym trafieniem (jedno rysowanie slotu 0 do celu 1 × 1 px). */
  prewarm(renderer, camera) {
    if (!renderer?.render || !camera) return { ok: false, ms: 0 };
    const THREE = this.THREE;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const s = this.slots[0];
    const vis = s.mesh.visible, rootVis = this.root.visible;
    const prevRt = renderer.getRenderTarget?.() ?? null;
    let rt = null;
    try {
      rt = new THREE.WebGLRenderTarget(1, 1);
      s.mesh.visible = true; this.root.visible = true;
      renderer.setRenderTarget(rt);
      renderer.render(this.root, camera);
    } catch (err) {
      return { ok: false, ms: 0, error: String(err?.message ?? err) };
    } finally {
      renderer.setRenderTarget(prevRt);
      s.mesh.visible = vis; this.root.visible = rootVis;
      rt?.dispose?.();
    }
    return { ok: true, ms: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 };
  }

  stats() {
    let visible = 0;
    for (const s of this.slots) if (s.mesh.visible) visible++;
    return { capacity: this.capacity, owned: this.byOwner.size, visible, peak: this.peak, steals: this.steals, acquired: this.acquired };
  }

  dispose() {
    for (const s of this.slots) { s.mesh.material.dispose(); this.root.remove(s.mesh); }
    this.geometry.dispose();
    this.root.parent?.remove(this.root);
  }
}
