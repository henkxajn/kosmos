// StarPointShader — profil PSF gwiazdy punktowej (niebo tła; ta sama fabryka posłuży płycie galaktyki w G1).
//
// ARC GALAXY, krok NIEBO (docs/design/GALAXY_PLAN.md §4, D-GX-4): literały STAR_VERT / STAR_FRAG przeniesione
// z ThreeRenderer._buildBackground CO DO ZNAKU (z końcami linii i wcięciami — keeper `sky_catalog_smoke` trzyma ich
// sumy SHA-256 z kotwicy e4e5717). Ścieżka OFF (flaga skyCatalog = false) buduje z nich ten sam materiał co przed
// krokiem — three kluczuje cache programów po TREŚCI ŹRÓDŁA, więc identyczny string = identyczny program.
//
// ⚠ Moduł BEZ IMPORTÓW (wzór modułu chunków głębi V4): wykonywalny pod node; THREE wstrzykuje wołający.
// ⚠ Chunki głębi logarytmicznej (V4) nakłada WOŁAJĄCY wyłącznie na ścieżce OFF. Kopuła nieba ich nie ma i mieć nie
//   może z tego samego powodu co mgławica (D-D3): rysuje się na liście nieprzezroczystej PRZED resztą sceny, bez
//   testu i zapisu głębi — planety zawsze ją zasłaniają.
// ⚠ Backticka nie wolno wstawić do literału GLSL — node --check przechodzi, a plik jest zepsuty.

export const STAR_VERT = `
        attribute float aIntensity;
        attribute float aSize;
        attribute float aPhase;
        varying vec3  vColor;
        varying float vI;
        uniform float uTime;
        uniform float uPx;

        void main() {
          vColor = color;
          // Śladowy „oddech" ±5% (w próżni brak scyntylacji)
          vI = aIntensity * (1.0 + 0.05 * sin(uTime * 0.3 + aPhase));
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPx;
          gl_Position  = projectionMatrix * mvPos;
        }
      `;
export const STAR_FRAG = `
        varying vec3  vColor;
        varying float vI;

        void main() {
          vec2  p  = gl_PointCoord - vec2(0.5);
          float d2 = dot(p, p);
          // Profil PSF: gaussowski rdzeń + słabszy szeroki ogon (jak glare optyki)
          float core = exp(-d2 * 38.0);
          float halo = exp(-d2 * 9.0) * 0.18;
          float I = (core + halo) * vI;
          if (I < 0.002) discard;
          gl_FragColor = vec4(vColor * I, 1.0);   // additive — alpha bez znaczenia
        }
      `;

// ── Wariant kopuły: gaśnięcie 71 prawdziwych układów (`aReal`, `uRealFade`) ──────────────────────────────────────────
// Przy wylocie do galaktyki (G2) prawdziwe gwiazdy nieba przechodzą w punkty płyty, więc na niebie gasną
// (D-GX-6); w NIEBO `uRealFade` = 1,0 (bez skutku). DERYWACJA, nie kopia (lekcja V4): dwie wstawki w kotwicach
// STAR_VERT, reszta co do znaku; brak kotwicy RZUCA (cisza jest gorsza od błędu).
export const REAL_FADE_DECL_ATTR    = '        attribute float aReal;\n';
export const REAL_FADE_DECL_UNIFORM = '        uniform float uRealFade;\n';
export const REAL_FADE_APPLY        = '          vI *= mix(1.0, uRealFade, aReal);\n';
const ANCHOR_ATTR    = '        attribute float aPhase;\n';
const ANCHOR_UNIFORM = '        uniform float uPx;\n';
const ANCHOR_APPLY   = '          vI = aIntensity * (1.0 + 0.05 * sin(uTime * 0.3 + aPhase));\n';

export function deriveRealFadeVert(src) {
  if (typeof src !== 'string') throw new TypeError('deriveRealFadeVert: źródło musi być stringiem');
  if (src.includes('uRealFade')) throw new Error('deriveRealFadeVert: źródło już ma uRealFade');
  let out = src;
  for (const [anchor, add] of [[ANCHOR_ATTR, REAL_FADE_DECL_ATTR], [ANCHOR_UNIFORM, REAL_FADE_DECL_UNIFORM], [ANCHOR_APPLY, REAL_FADE_APPLY]]) {
    const i = out.indexOf(anchor);
    if (i < 0 || out.indexOf(anchor, i + 1) >= 0) throw new Error('deriveRealFadeVert: kotwica nie występuje dokładnie raz: ' + anchor.trim());
    out = out.slice(0, i + anchor.length) + add + out.slice(i + anchor.length);
  }
  return out;
}

export const STAR_VERT_SKY = deriveRealFadeVert(STAR_VERT);   // liczone RAZ, na starcie modułu
export const STAR_FRAG_SKY = STAR_FRAG;

/**
 * Materiał gwiazd KOPUŁY nieba (flaga skyCatalog): lista nieprzezroczysta, bez testu i zapisu głębi, addytywnie
 * (D-D3 — jak mgławica), atrybuty jak dawne niebo + `aReal`.
 * @param <class 'object'> THREE — moduł three (wstrzykiwany)
 * @param {Object} [opts] — pixelRatio (device px na px CSS), realFade (0…1; 1 = prawdziwe układy w pełni)
 */
export function createSkyStarMaterial(THREE, { pixelRatio = 1, realFade = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:     { value: 0.0 },
      uPx:       { value: pixelRatio },   // gl_PointSize jest w device px
      uRealFade: { value: realFade },     // 1,0 = prawdziwe układy w pełni (NIEBO); G2 schodzi do 0 przy wylocie
    },
    vertexShader:   STAR_VERT_SKY,
    fragmentShader: STAR_FRAG_SKY,
    vertexColors: true,
    transparent:  false,   // lista NIEPRZEZROCZYSTA: rysowana przed planetami (renderOrder −1), więc nigdy na nich
    depthTest:    false,
    depthWrite:   false,
    blending: THREE.AdditiveBlending,
  });
}

export const StarPointShader = { STAR_VERT, STAR_FRAG, STAR_VERT_SKY, STAR_FRAG_SKY, deriveRealFadeVert, createSkyStarMaterial };
