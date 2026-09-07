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
import { GLSL_NOISE_LIB } from './PlanetShader.js';
import { mixSeed, hashStringToInt } from '../utils/SeedMath.js';

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

  // ── Granulacja (S2) ───────────────────────────────────────────────────────
  // 0 = tarcza jak przed S2 (sama tekstura), 1 = pełna modulacja proceduralna.
  // ⚠ MIESZAMY z teksturą, nie zastępujemy jej (D-V2b): tekstura niesie strukturę
  //   wielkoskalową (dzięki niej obrót jest w ogóle widoczny), a proceduralny człon
  //   dokłada kipienie. Zejście na 0 to awaryjne wyłączenie samego wyglądu bez flagi.
  GRAN_MIX:      1.0,
  GRAN_FREQ:     26.0,   // skala komórek na sferze jednostkowej (mnożona przez klasę)
  GRAN_CONTRAST: 0.40,   // głębokość modulacji wokół 1.0
  GRAN_WARP:     0.09,   // amplituda domain-warpu — POKRĘTŁO decydujące, czy to kipi czy szumi
  BOIL_HZ:       0.10,   // [rad/s] tempo obrotu wektora warpu = tempo kipienia

  // Ciągłe wygaszanie amplitudy po średnicy tarczy [CSS px] (D-V2v: amplituda GAŚNIE
  // płynnie, tylko liczba oktaw skacze — skok amplitudy widać jako „pop").
  // ⚠ Przy domyślnej ramce układu tarcza ma 17-107 px, więc granulacja jest wtedy
  //   praktycznie niewidoczna. To jest ZAMIERZONE (D-V2ab), nie niedoróbka.
  SURF_PX_MIN:   70,
  SURF_PX_FULL:  180,

  // Szerokość rampy wygaszania granulacji [NdotV] — patrz granFadeEdges (D-V2e).
  // ⚠ Konsument w shaderze dochodzi w S2; w S1 czyta to KOSMOS.debug.sunInfo(),
  //   żeby gate zobaczył policzone brzegi ZANIM cokolwiek od nich zależy.
  // ⚠ WYNIK LIVE-GATE S2 (wariant A): przy GUARD_BAND = 0, czyli z bramką WYŁĄCZONĄ
  //   w całości, limb klasy M przy tarczy ~936 px NIE migotał — ani w bezruchu, ani
  //   w ruchu. Bramka schodzi więc do roli PODŁOGI BEZPIECZEŃSTWA, a nie środka ciężkości
  //   projektu: 0.08 zamiast 0.25.
  // ⚠ Zera NIE wybrano świadomie: przy band = 0 shader widzi hi == lo i wchodzi w gałąź
  //   granFade = 1.0, czyli bramka znika CAŁKOWICIE. To nie jest wąska podłoga, tylko jej
  //   brak. 0.08 zostawia mechanizm uzbrojony i zarazem gasi twardą krawędź kontrastu,
  //   która przy skoku 0 → pełny sama byłaby widocznym pierścieniem.
  // ⚠ To pokrętło steruje WYŁĄCZNIE szerokością rampy. Strefa PŁASKA (NdotV < lo) zależy
  //   od FADE_MARGIN/FADE_EPS i bandu NIE SŁUCHA — na M to zewnętrzne 18,2% promienia
  //   niezależnie od tej liczby. Jeśli podłoga ma być jeszcze węższa, lewarem jest
  //   FADE_MARGIN, a to zmiana na commit kalibracyjny, nie tutaj.
  GUARD_BAND: 0.08,
};

// ── Zmierzone średnie jasności map emission ─────────────────────────────────
// ⚠ To POMIAR wypakowanych PNG-ów (audyt V2), nie parametr do strojenia. Wchodzi do
//   solvera brzegów jako `granNeutral`: przy GRAN_MIX = 1 neutralem iloczynu
//   granTex * granProc jest średnia tekstury, bo człon proceduralny jest wyśrodkowany
//   na 1.0. Nominalny zakres mix(0.55, 1.35, lum) NIE jest tu osiągany — mapa klasy M
//   ma 37% tekseli poniżej 0.1 luminancji liniowej.
// ⚠ Stoi tutaj, a nie w STAR_TYPES, właśnie dlatego, że to własność ASSETU, a nie klasy
//   gwiazdy — w konfigu ktoś prędzej czy później zacznie to „stroić".
const EMISSION_MEAN = { M: 0.693, K: 0.782, G: 0.907, F: 1.012 };
export function emissionMeanFor(spectralType) {
  return EMISSION_MEAN[spectralType] ?? EMISSION_MEAN.G;
}

// ── Ziarno per gwiazda ──────────────────────────────────────────────────────
// ⚠ Identyfikatory encji są STRUKTURALNE (entity_1, entity_2...), więc hash sąsiednich
//   gwiazd różni się o 1, a mulberry32 ma dla takich wejść słabo rozrzucony PIERWSZY rzut.
//   Stąd finalizer mixSeed i rozgrzanie strumienia trzema rzutami — dokładnie ta lekcja,
//   która w EmpireGenerator kosztowała kolizje celów 3 z 8 gwiazd.
export function sunSeedFromId(id) {
  let z = mixSeed(hashStringToInt(String(id ?? 'star')));
  const rng = () => {
    z = (z + 0x6D2B79F5) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng(); rng(); rng();
  return new THREE.Vector3(rng() * 100, rng() * 100, rng() * 100);
}

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
// ── Żywe warianty rdzenia (S2) ──────────────────────────────────────────────
// ⚠ Warianty VERBATIM wyżej ZOSTAJĄ NIETKNIĘTE i to one biegną przy fladze OFF.
//   Dzięki temu „OFF == stan sprzed slice'u" jest prawdą Z KONSTRUKCJI, a nie obietnicą:
//   ten sam string źródła to ten sam WebGLProgram. Golden-hash w keeperze dalej przechodzi.
const STAR_CORE_VERT_LIVE = /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vObjPos;
        void main() {
          vUv = uv;
          vObjPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `;

const STAR_CORE_FRAG_LIVE = /* glsl */ `
        uniform sampler2D uEmission;
        uniform vec3  uColor;
        uniform float uBrightness;
        uniform float uWhitePower;

        uniform vec3  uSunSeed;
        uniform float uGranMix;
        uniform float uGranFreq;
        uniform float uGranContrast;
        uniform float uGranWarp;
        uniform float uBoilPhase;
        uniform float uGranAmp;
        uniform float uGranFadeLo;
        uniform float uGranFadeHi;
        uniform int   uSunDetail;

        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vObjPos;

${GLSL_NOISE_LIB}

        // Triplanar z ROZDZIELONYM kierunkiem mieszania i punktem probkowania (D-V2t).
        // sphereNoise z GLSL_NOISE_LIB liczy wagi z TEGO SAMEGO p, ktore probkuje, wiec
        // przesuniecie punktu przez warp przesuwaloby takze wagi — wzor morfowalby
        // czesciowo dlatego, ze trzy rzuty triplanarne sie PRZEMIESZUJA, a nie dlatego,
        // ze pole plynie. Tu kierunek zostaje na sferze, a probkowanie wedruje.
        float sunNoise(vec3 dir, vec3 p, float scale) {
          vec3 w = abs(dir);
          w = w / (w.x + w.y + w.z + 0.0001);
          return snoise(p.yz * scale) * w.x
               + snoise(p.xz * scale) * w.y
               + snoise(p.xy * scale) * w.z;
        }

        void main() {
          vec3 emTex = texture2D(uEmission, vUv).rgb;
          float lum = dot(emTex, vec3(0.299, 0.587, 0.114));

          float NdotV = max(dot(vNormal, vViewDir), 0.0);
          float limb = 0.35 + 0.65 * pow(NdotV, 0.65);
          float granTex = mix(0.55, 1.35, lum);

          // ── Granulacja proceduralna (S2) ───────────────────────────────
          vec3 sp = normalize(vObjPos);
          vec3 ps = sp + uSunSeed;
          vec3 pw = ps;

          // Drabina 2/3/4 sunNoise. Poziom 1 wymienia druga oktawe na warp: przy sredniej
          // tarczy warp kupuje wiecej pozornej zlozonosci niz kolejne pasmo czestotliwosci.
          bool secondOctave = (uSunDetail != 1);

          if (uSunDetail >= 1) {
            vec3 ref = abs(sp.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 t1 = normalize(cross(sp, ref));
            vec3 t2 = cross(sp, t1);
            float w1 = sunNoise(sp, ps + vec3(11.3, 5.7, 2.1), uGranFreq * 0.28);
            float w2 = sunNoise(sp, ps + vec3(3.9, 17.1, 8.4), uGranFreq * 0.28);
            // ⚠ Wektor warpu OBRACA SIE w plaszczyznie stycznej. Obrot ma ZEROWY transport
            //   netto, wiec pole kipi W MIEJSCU zamiast dryfowac. Dryf bylby DRUGIM ruchem
            //   konkurujacym z obrotem gwiazdy — dokladnie anatomia V-257.
            float ca = cos(uBoilPhase), sa = sin(uBoilPhase);
            pw = ps + ((w1 * ca - w2 * sa) * t1 + (w1 * sa + w2 * ca) * t2) * uGranWarp;
          }

          float n = sunNoise(sp, pw, uGranFreq);
          if (secondOctave) n = (n + sunNoise(sp, pw, uGranFreq * 2.1) * 0.5) * 0.6667;

          // ⚠ Bramka progu bloomu (D-V2e). Ponizej uGranFadeLo granulacja jest PLASKA,
          //   wiec kontur luminancji L=1 przestaje zalezec od szumu i jest nieruchomym
          //   okregiem — inaczej maska bloomu wrze na limbie (prog ma smoothWidth 0.01,
          //   czyli jest praktycznie binarny i przepuszcza CALY teksel, nie nadwyzke).
          // ⚠ Straz hi > lo jest OBOWIAZKOWA: smoothstep(e, e, x) dzieli przez zero.
          //   Rowne brzegi znacza „tarcza nie przecina progu" ⇒ pelny kontrast.
          float granFade = (uGranFadeHi > uGranFadeLo)
            ? smoothstep(uGranFadeLo, uGranFadeHi, NdotV)
            : 1.0;

          float granProc = 1.0 + n * uGranContrast * granFade * uGranAmp;
          float gran = mix(granTex, granTex * granProc, uGranMix);

          vec3 base = uColor * uBrightness * limb * gran;
          base += vec3(1.0) * uBrightness * 0.45 * pow(NdotV, uWhitePower * 1.7);
          gl_FragColor = vec4(base, 1.0);
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
function createStarCoreMaterial({ emissionMap, sharedColor, brightness, whitePower,
                                  live = false, seed = null, granFreqMult = 1.0 }) {
  const uniforms = {
    uEmission:   { value: emissionMap },
    uColor:      { value: sharedColor },   // ⚠ alias V-248 — patrz JSDoc wyżej
    uBrightness: { value: brightness },    // 2.5-3.5 z STAR_TYPES.corona = skala HDR rdzenia
    uWhitePower: { value: whitePower },    // szerokość gorącego centrum (M/K szerokie, F wąskie)
  };
  if (!live) {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader:   STAR_CORE_VERT,
      fragmentShader: STAR_CORE_FRAG,
    });
  }
  // Żywa ścieżka: te same cztery uniformy + granulacja. Wszystkie wartości per gwiazda
  // idą UNIFORMEM — źródło jest modułową stałą, więc wszystkie gwiazdy dzielą jeden program.
  Object.assign(uniforms, {
    uSunSeed:      { value: seed ?? new THREE.Vector3() },
    uGranMix:      { value: LIVE_SUN.GRAN_MIX },
    uGranFreq:     { value: LIVE_SUN.GRAN_FREQ * granFreqMult },
    uGranContrast: { value: LIVE_SUN.GRAN_CONTRAST },
    uGranWarp:     { value: LIVE_SUN.GRAN_WARP },
    uBoilPhase:    { value: 0 },     // AKUMULOWANA faza (D-V2u) — bump w _tickClouds
    uGranAmp:      { value: 0 },     // ciągłe wygaszenie po px — liczone w _tickSunMaterials
    uGranFadeLo:   { value: 0 },     // brzegi bramki progu bloomu — solver na CPU
    uGranFadeHi:   { value: 0 },
    uSunDetail:    { value: 0 },
  });
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   STAR_CORE_VERT_LIVE,
    fragmentShader: STAR_CORE_FRAG_LIVE,
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
  sunSeedFromId,
  emissionMeanFor,
};
