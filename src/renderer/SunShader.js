// SunShader — materiały gwiazdy + obiekt strojenia LIVE_SUN (V2 / slice S1).
//
// Lustro żywej połowy GasGiantShader.js: obiekt strojenia eksportowany i CZYTANY CO KLATKĘ
// przez ThreeRenderer._tickSunMaterials, żeby gate zmieniał wartość jednym tokenem w konsoli.
//
// ⚠ S1 JEST WIZUALNIE JAŁOWY. GLSL poniżej został przeniesiony z renderStar VERBATIM —
//   co do bajtu. To nie jest ambicja stylistyczna, tylko jedyny mechaniczny dowód, jaki ten
//   commit ma: three kluczuje cache programów po TREŚCI ŹRÓDŁA shadera
//   (WebGLShaderCache._getShaderStage -> customVertexShaderID -> getProgramCacheKey), więc
//   identyczny string = identyczny WebGLProgram = identyczna klatka. Przeniesienie było
//   zrobione skryptem, który po zapisie porównał oba stringi znak po znaku.
//   Zmiana czegokolwiek w tych literałach zaczyna się dopiero w S2 (granulacja) — i wtedy
//   diff S2 pokazuje WYŁĄCZNIE tę zmianę, bo przenosiny są już za nami (precedens C8).
//
// ⚠ REGUŁA DOMU: każda wartość per-gwiazda idzie UNIFORMEM, NIGDY interpolacją stringa do
//   GLSL. Źródła są modułowymi stałymi, więc wszystkie gwiazdy dzielą jeden program.

import * as THREE from 'three';

// ── Strojenie na żywo ────────────────────────────────────────────────────────
// Czytane co klatkę w _tickSunMaterials (poza OMEGA_RAD_PER_S, które czyta _tickClouds).
// ⚠ Pokrętło jest w RADIANACH NA SEKUNDĘ, nie w stopniach jak LIVE_GAS.OMEGA_DEG —
//   świadome zerwanie parytetu nazw (D-S1-a). Powód: to pokrętło jest PRZYRZĄDOWE, nie
//   estetyczne — trzy pomiary gate'u pokazały, że 1,72 °/s jest dla oka niewidoczne, więc
//   stroi się je odczytem rotation.y, który jest w radianach. Jednostka pokrętła i jednostka
//   sondy muszą się zgadzać.
const LIVE_SUN = {
  // 0.03 rad/s = 1,71887 °/s = pełny obrót w 209 s. Spadek po V-260: to DOKŁADNIE
  // tyle, ile dawało stare `+= 0.0005` na klatkę przy równych 60 fps.
  OMEGA_RAD_PER_S: 0.03,

  // Drabina oktaw — progi w CSS px średnicy tarczy (lustro DETAIL_PX_* gazowca).
  DETAIL_PX_FULL: 260,
  DETAIL_PX_MED:  90,
  DETAIL_CAP:     2,     // furtka gate'u: zbija sufit drabiny bez restartu

  // Szerokość rampy wygaszania granulacji [NdotV] — patrz granFadeEdges (D-V2e).
  // ⚠ Konsument w shaderze dochodzi w S2; w S1 czyta to KOSMOS.debug.sunInfo(),
  //   żeby gate zobaczył policzone brzegi ZANIM cokolwiek od nich zależy.
  GUARD_BAND: 0.25,
};

// ── GLSL przeniesiony VERBATIM z renderStar (patrz nagłówek) ─────────────────
const STAR_CORE_VERT = /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `;

const STAR_CORE_FRAG = /* glsl */ `
        uniform sampler2D uEmission;
        uniform vec3  uColor;
        uniform float uBrightness;
        uniform float uWhitePower;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        void main() {
          vec3 emTex = texture2D(uEmission, vUv).rgb;
          float lum = dot(emTex, vec3(0.299, 0.587, 0.114));

          // Limb darkening — krawędzie ciemniejsze (fizycznie poprawne)
          float NdotV = max(dot(vNormal, vViewDir), 0.0);
          float limb = 0.35 + 0.65 * pow(NdotV, 0.65);

          // Granulacja powierzchni z tekstury emission (widoczna przy zoomie)
          float gran = mix(0.55, 1.35, lum);

          // HDR linear: kolor typu × jasność × kształt — BEZ clampu i Reinharda
          vec3 base = uColor * uBrightness * limb * gran;

          // Gorące centrum — uWhitePower×1.7 zachowuje charakter per-typ
          // (M/K szerokie białe centrum, F wąskie)
          base += vec3(1.0) * uBrightness * 0.45 * pow(NdotV, uWhitePower * 1.7);

          gl_FragColor = vec4(base, 1.0);
        }
      `;

const STAR_CORONA_VERT = /* glsl */ `
        varying vec2 vP;
        void main() {
          vP = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * (modelViewMatrix * vec4(position, 1.0));
        }
      `;

const STAR_CORONA_FRAG = /* glsl */ `
        varying vec2 vP;
        uniform vec3  uColor;
        uniform float uGain;
        void main() {
          float d = length(vP);
          float I = (exp(-d * 4.0) - exp(-4.0)) / (1.0 - exp(-4.0));   // wykładniczo DO ZERA
          gl_FragColor = vec4(uColor * uGain * max(I, 0.0), 1.0);
        }
      `;
// ── Fabryki materiałów ──────────────────────────────────────────────────────

/**
 * Materiał rdzenia gwiazdy.
 *
 * ⚠ `sharedColor` to INSTANCJA THREE.Color należąca do wołającego, przypisywana tu
 *   wprost do uniformu — NIE .copy() i NIE .clone(). renderStar przypisuje tę samą
 *   instancję do _starLight.color, więc etap 4 Sfery Dysona (setHex 0x9933cc na świetle)
 *   przemalowuje także TARCZĘ gwiazdy. To jest alias V-248: zachowanie ZAMIERZONE,
 *   od którego zależy jedyny wizual endgame'u. Wyciągnięcie materiału do fabryki jest
 *   dokładnie tym momentem, w którym ktoś „posprząta" to na .clone() i po cichu skasuje
 *   fioletową gwiazdę. NIE ROBIĆ TEGO.
 */
function createStarCoreMaterial({ emissionMap, sharedColor, brightness, whitePower }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uEmission:   { value: emissionMap },
      uColor:      { value: sharedColor },   // ⚠ alias V-248 — patrz JSDoc wyżej
      uBrightness: { value: brightness },    // 2.5-3.5 z STAR_TYPES.corona = skala HDR rdzenia
      uWhitePower: { value: whitePower },    // szerokość gorącego centrum (M/K szerokie, F wąskie)
    },
    vertexShader:   STAR_CORE_VERT,
    fragmentShader: STAR_CORE_FRAG,
  });
}

/**
 * Materiał korony (billboard addytywny).
 * ⚠ `gain` < 1.0 trzyma koronę PONIŻEJ progu bloomu (1.0) — decyzja z V0, nie przypadek:
 *   szeroki miękki zanik robi korona, ciasny glare robi bloom. Nie podnosić bez pomiaru.
 */
function createStarCoronaMaterial({ coronaColor, gain }) {
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true,
    uniforms: {
      uColor: { value: coronaColor },
      uGain:  { value: gain },
    },
    vertexShader:   STAR_CORONA_VERT,
    fragmentShader: STAR_CORONA_FRAG,
  });
}

export const SunShader = {
  LIVE_SUN,
  createStarCoreMaterial,
  createStarCoronaMaterial,
};
