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
import { promSlotTiming } from './SunAnimationLogic.js';

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

  // ── Korona: strumienie + oddech (S3) ─────────────────────────────────────
  // ⚠ SUFIT 0.98 JEST NOŚNY, nie ozdobny. Zapas do progu bloomu przy limbie wynosi
  //   5-12×, ale to zapas przy ZASŁONIĘTYM środku korony. Gracz jednym kliknięciem
  //   i scrollem wjeżdża do WNĘTRZA tarczy (_minDist 0.3 wobec promienia rdzenia
  //   2.29-4.57): FrontSide wycina rdzeń, korona przestaje być zasłonięta i zalewa
  //   ekran wartością I(0) = 1.0. Realny zapas klasy G wynosi tam 1,115× — czyli
  //   mnożnik 1.6 BEZ sufitu wypycha pełnoekranowy addytywny quad ponad próg.
  STREAMER_DEPTH: 0.55,   // ile smugi modulują gładki gradient
  STREAMER_GAIN:  1.6,    // szczytowe pojaśnienie promienia (pod sufitem)
  STREAMER_DRIFT: 0.015,  // [rad/s] ko-rotacja smug wokół osi gwiazdy
  CORONA_GUARD:   0.98,   // twardy sufit luminancji źródła korony
  BREATH_AMP:     0.03,   // ±3% „oddechu" jasności (zachowane z V0)
  BREATH_HZ:      0.9,    // [rad/s] tempo oddechu

  // ── Protuberancje (S4) ───────────────────────────────────────────────────
  // ⚠ PROM_GAIN jest w LUMINANCJI DOCELOWEJ, nie w surowym mnożniku: barwa H-alfa
  //   zmieszana z glowColor ma lumę 0.239 (M) do 0.597 (G), więc ten sam mnożnik
  //   znaczyłby na czterech klasach cztery różne jasności (D-V2m).
  // ⚠ Podprogowość NIE zależy od tej liczby — bierze się z CORONA_GUARD, przez który
  //   przechodzi suma korony i protuberancji. Dlatego D-V2k („wymuś podprogowość
  //   zamiast chować") jest spełnione strukturalnie, a rampa PROM_PX_* istnieje tylko
  //   po to, żeby łuk o szerokości dwóch pikseli nie migotał na szerokim planie.
  // ⚠ BAKED — te trzy są czytane RAZ, przy budowie materiału/slotów (promColorFor,
  //   promSlotsFor). Poking ich w konsoli NIE ZROBI NIC do czasu przebudowy gwiazdy.
  //   Nazwane wprost, bo gasTuning ma cztery takie pola i gate potrafi na nich stracić
  //   rundę, biorąc brak reakcji za dowód czegoś innego.
  PROM_GAIN:     0.55,   // BAKED — docelowa luminancja szczytu łuku
  PROM_TINT:     0.60,   // BAKED — ile w stronę glowColor (reszta to H-alfa)
  PROM_HEIGHT:   0.30,   // BAKED — wysokość łuku w promieniach rdzenia
  // ⚠ PROM_DRIFT USUNIĘTE: zadeklarowane i nigdy nieczytane. Tempo falowania filamentu
  //   jest stałą w GLSL (0.22 / 0.55); żywe pokrętło wymagałoby WŁASNEJ akumulowanej fazy,
  //   inaczej przekręcenie go teleportowałoby wzór (V-270). To zakres na osobny slice,
  //   a martwe pole obok żywych to dokładnie kształt, który usunął 1079cd9.
  PROM_LIMB_BAND: 0.55,  // |dot| kotwicy, powyżej którego łuk gaśnie
  PROM_HALFW:    0.26,   // połowa szerokości łuku w promieniach rdzenia
  PROM_PX_MIN:   60,
  PROM_PX_FULL:  140,

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

// ── Barwa protuberancji (D-V2m) ─────────────────────────────────────────────
// Chromosferyczna czerwień H-alfa zmieszana ku barwie poświaty gwiazdy, a potem
// ZNORMALIZOWANA luminancją, żeby PROM_GAIN znaczyło to samo na każdej klasie.
const HALPHA = new THREE.Color(0xff3355);
export function promColorFor(glowHex) {
  const c = new THREE.Color(glowHex ?? 0xffffff).lerp(HALPHA, 1 - LIVE_SUN.PROM_TINT);
  const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(LIVE_SUN.PROM_GAIN / Math.max(luma, 1e-4));
}

// ── Ziarno per gwiazda ──────────────────────────────────────────────────────
// ⚠ Identyfikatory encji są STRUKTURALNE (entity_1, entity_2...), więc hash sąsiednich
//   gwiazd różni się o 1, a mulberry32 ma dla takich wejść słabo rozrzucony PIERWSZY rzut.
//   Stąd finalizer mixSeed i rozgrzanie strumienia trzema rzutami — dokładnie ta lekcja,
//   która w EmpireGenerator kosztowała kolizje celów 3 z 8 gwiazd.
function makeSunRng(id, salt) {
  let z = mixSeed(hashStringToInt(String(id ?? 'star')) ^ salt);
  const rng = () => {
    z = (z + 0x6D2B79F5) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng(); rng(); rng();   // rozgrzanie — pierwsze wyjścia są najsłabsze
  return rng;
}

export function sunSeedFromId(id) {
  const rng = makeSunRng(id, 0);
  return new THREE.Vector3(rng() * 100, rng() * 100, rng() * 100);
}

// ── Sloty protuberancji (S4) ────────────────────────────────────────────────
// ⚠ OSOBNY strumień (inna sól), żeby dołożenie slotów nie przesunęło ziarna granulacji
//   i nie zmieniło wyglądu powierzchni wszystkich gwiazd — ta sama zasada, dla której
//   EmpireGenerator trzyma oś objective na własnym strumieniu.
// ⚠ Kotwice są ŚWIATOWE i nieruchome (SPIN_COUPLE = 0, D-V2x): przy ω = 0.03 rad/s
//   kotwica sprzężona z obrotem przewędrowałaby 80-120° w ciągu jednego życia łuku,
//   czyli łuk ślizgałby się po limbie zamiast wybuchać i gasnąć w miejscu.
// ⚠ Szerokości ściśnięte ku równikowi (×0.7): pas aktywny, nie bieguny.
export function promSlotsFor(id) {
  const rng = makeSunRng(id, 0x5A17);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const lat = Math.asin(rng() * 2 - 1) * 0.7;
    const lon = rng() * Math.PI * 2;
    const t = promSlotTiming(rng(), rng());
    out.push({
      anchor: new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)),
      dormant: t.dormant, rise: t.rise, sustain: t.sustain, collapse: t.collapse,
      offset: rng() * (t.dormant + t.rise + t.sustain + t.collapse),
      height: LIVE_SUN.PROM_HEIGHT * (0.75 + rng() * 0.5),
      seed:   rng() * 100,
      phase:  rng() * 100,
    });
  }
  return out;
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

const STAR_CORONA_FRAG_LIVE = /* glsl */ `
        varying vec2 vP;
        uniform vec3  uColor;
        uniform float uGain;

        uniform vec3  uSunSeed;
        uniform vec3  uSunCamRight;
        uniform vec3  uSunCamUp;
        uniform float uStreamerPhase;
        uniform float uStreamerDepth;
        uniform float uStreamerGain;
        uniform float uCoronaGuard;
        uniform int   uSunDetail;

        uniform float uPromAny;
        uniform vec3  uPromColor;
        uniform float uPromTime;
        uniform vec4  uProm0;
        uniform vec4  uProm1;
        uniform vec4  uProm2;
        uniform vec4  uProm3;
        uniform vec4  uPromB0;
        uniform vec4  uPromB1;
        uniform vec4  uPromB2;
        uniform vec4  uPromB3;
        uniform vec3  uStarCenterWorld;
        uniform vec3  uCamPosWorld;
        uniform float uQuadHalf;
        uniform float uCoreRadius;

${GLSL_NOISE_LIB}

        // Jeden slot protuberancji, liczony w przestrzeni quada.
        // P = (cx, cy, halfW, intensity) — kotwica ZRZUTOWANA na quad przez CPU.
        // B = (height, seed, phase, spare).
        // ⚠ Kierunek promienisty bierze sie z samej kotwicy: up = normalize(P.xy). Nie ma
        //   tu zadnej bazy do zbudowania i zadnej degeneracji do obsluzenia, bo waga limbu
        //   zeruje intensywnosc dokladnie tam, gdzie P.xy dazy do zera (patrz limbWeight).
        vec3 promSlot(vec4 P, vec4 B, vec2 p) {
          if (P.w < 0.002 || dot(P.xy, P.xy) < 1e-8) return vec3(0.0);
          vec2 up = normalize(P.xy);
          vec2 rt = vec2(-up.y, up.x);
          vec2 loc = vec2(dot(p - P.xy, rt), dot(p - P.xy, up)) / max(P.z, 1e-5);
          // Prostokat ograniczajacy PRZED szumem — idiom gasStormEffect: slot placi za
          // szum tylko na wlasnym skrawku quada, a nie na calym ekranie.
          if (abs(loc.x) > 1.2 || loc.y < -0.30 || loc.y > B.x * 1.45) return vec3(0.0);

          // Luk: okrag przez (-0.55, 0) i (0.55, 0) o wierzcholku (0, h).
          float h  = max(B.x, 0.05);
          float cy = (h * h - 0.3025) / (2.0 * h);
          float rr = h - cy;
          float wob = snoise(vec2(loc.x * 2.6 + B.y, uPromTime * 0.22 + B.z)) * 0.10
                    + snoise(vec2(loc.x * 6.1 + B.y, uPromTime * 0.55 + B.z)) * 0.045;
          float dArc = abs(length(loc - vec2(0.0, cy)) - rr * (1.0 + wob));
          float core = exp(-dArc * dArc / 0.0055);
          float foot = smoothstep(-0.20, 0.22, loc.y);   // stopy wtapiaja sie w limb
          float tap  = 1.0 - smoothstep(0.55, 1.05, abs(loc.x));
          return uPromColor * (P.w * core * foot * tap);
        }

        void main() {
          float d = length(vP);
          float I = (exp(-d * 4.0) - exp(-4.0)) / (1.0 - exp(-4.0));   // wykladniczo DO ZERA

          // ⚠ Wczesne wyjscie PRZED szumem. Dwa powody naraz:
          //   1. ~29% quada nie ma nic do pokazania, a szum kosztuje tam tyle samo;
          //   2. ogony alfy w zakresie 0.0005-0.03 to dokladnie ten mechanizm, ktory
          //      kazal usunac trzy stare sprite-y glow (mierzony podbicie szarosci
          //      +5.5/255) — zerowanie ich u zrodla zamyka te klase.
          // ⚠ To jest return, a NIE discard: discard wylacza wczesne odrzucanie
          //   glebi dla calego draw calla, wiec fragmenty za nieprzezroczystym rdzeniem
          //   liczylyby caly szum, zanim zostana wyrzucone.
          if (I < 0.002) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

          float S = 1.0;
          if (uSunDetail >= 1) {
            // Kierunek NA NIEBIE, w przestrzeni SWIATA — nie kat ekranowy (D-V2h).
            // Quad niesie kwaternion kamery, wiec kat liczony z samego vP bylby
            // przybity do ekranu i smugi obracalyby sie razem z kamera: klasyczny
            // znak rozpoznawczy billboardu. Odtworzenie kierunku swiata z bazy kamery
            // sprawia, ze orbitowanie PRZECIAGA wielkie kolo przez pole 3D i smugi
            // naleza do gwiazdy, a nie do obserwatora.
            // ⚠ Straz na dlugosci: w samym srodku quada vP = (0,0), a normalize(0)
            //   to NaN. Srodek bywa widoczny — gracz moze wjechac kamera do wnetrza
            //   tarczy, gdzie rdzen znika przez backface culling.
            vec3 sky = (d > 1e-4)
              ? normalize(uSunCamRight * vP.x + uSunCamUp * vP.y)
              : vec3(0.0, 1.0, 0.0);
            float ca = cos(uStreamerPhase), sa = sin(uStreamerPhase);
            vec3 sr = vec3(sky.x * ca - sky.z * sa, sky.y, sky.x * sa + sky.z * ca) + uSunSeed;
            // Pole zalezy WYLACZNIE od kierunku, nie od promienia — stad promieniste
            // smugi zamiast plam.
            float ray = sphereNoise(sr, 3.2);
            if (uSunDetail >= 2) ray += sphereNoise(sr, 7.4) * 0.4;
            S = 1.0 + uStreamerDepth * (uStreamerGain - 1.0) * smoothstep(-0.15, 0.55, ray)
                    - uStreamerDepth * 0.35 * smoothstep(0.20, -0.45, ray);
          }

          // ⚠ Sufit NOSNY (patrz LIVE_SUN.CORONA_GUARD): przy kamerze wewnatrz tarczy
          //   korona jest pelnoekranowa i NIEZASLONIETA, wiec bez tego clampa mnoznik
          //   1.6 wypchnalby ja ponad prog bloomu.
          vec3 prom = vec3(0.0);
          if (uPromAny > 0.5) {
            // ⚠ MASKA SYLWETKI liczona DOKLADNIE, promien-kontra-kula w przestrzeni
            //   swiata (D-V2y) — nie testem na promieniu w przestrzeni quada. Test 2D
            //   zakladalby rzut rownolegly, a przy bliskiej kamerze prawdziwa sylwetka
            //   kuli jest o kilka procent WIEKSZA niz jej promien; luk wchodzilby wtedy
            //   na tarcze. Tu liczymy najmniejsze zblizenie promienia do srodka gwiazdy,
            //   wiec perspektywa wychodzi za darmo i poprawnie na kazdym dystansie.
            vec3 fragW = uStarCenterWorld
                       + uSunCamRight * (vP.x * uQuadHalf)
                       + uSunCamUp    * (vP.y * uQuadHalf);
            vec3 rdir  = normalize(fragW - uCamPosWorld);
            vec3 oc    = uCamPosWorld - uStarCenterWorld;
            float bq   = dot(oc, rdir);
            float perp = sqrt(max(dot(oc, oc) - bq * bq, 0.0));
            float outsideDisc = smoothstep(uCoreRadius * 0.995, uCoreRadius * 1.02, perp);

            prom = promSlot(uProm0, uPromB0, vP) + promSlot(uProm1, uPromB1, vP)
                 + promSlot(uProm2, uPromB2, vP) + promSlot(uProm3, uPromB3, vP);
            prom *= outsideDisc;
          }

          // ⚠ Protuberancje wchodza POD TEN SAM sufit co korona. Stad podprogowosc
          //   D-V2k bierze sie strukturalnie, a nie z dobranej wartosci PROM_GAIN.
          vec3 c = min(uColor * uGain * I * S + prom, vec3(uCoronaGuard));
          gl_FragColor = vec4(max(c, 0.0), 1.0);
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
function createStarCoronaMaterial({ coronaColor, gain, live = false, seed = null,
                                    glowHex = 0xffffff, quadHalf = 1, coreRadius = 1 }) {
  const uniforms = {
    uColor: { value: coronaColor },
    uGain:  { value: gain },
  };
  // ⚠ Vertex jest WSPÓLNY dla obu ścieżek — żywa korona nie potrzebuje ani jednego
  //   nowego varying (kierunek świata odtwarzamy z bazy kamery we fragmencie).
  if (!live) {
    return new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: true,
      uniforms,
      vertexShader:   STAR_CORONA_VERT,
      fragmentShader: STAR_CORONA_FRAG,
    });
  }
  Object.assign(uniforms, {
    uSunSeed:       { value: seed ?? new THREE.Vector3() },
    uSunCamRight:   { value: new THREE.Vector3(1, 0, 0) },   // sensowny stan startowy —
    uSunCamUp:      { value: new THREE.Vector3(0, 1, 0) },   // uniform pisany co klatkę
    uStreamerPhase: { value: 0 },   // AKUMULOWANA faza (D-V2u)
    uStreamerDepth: { value: LIVE_SUN.STREAMER_DEPTH },
    uStreamerGain:  { value: LIVE_SUN.STREAMER_GAIN },
    uCoronaGuard:   { value: LIVE_SUN.CORONA_GUARD },
    uSunDetail:     { value: 0 },
    uPromAny:       { value: 0 },
    uPromColor:     { value: promColorFor(glowHex) },
    uPromTime:      { value: 0 },
    uProm0:  { value: new THREE.Vector4() },
    uProm1:  { value: new THREE.Vector4() },
    uProm2:  { value: new THREE.Vector4() },
    uProm3:  { value: new THREE.Vector4() },
    uPromB0: { value: new THREE.Vector4() },
    uPromB1: { value: new THREE.Vector4() },
    uPromB2: { value: new THREE.Vector4() },
    uPromB3: { value: new THREE.Vector4() },
    uStarCenterWorld: { value: new THREE.Vector3() },
    uCamPosWorld:     { value: new THREE.Vector3() },
    uQuadHalf:        { value: quadHalf },
    uCoreRadius:      { value: coreRadius },
  });
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true,
    uniforms,
    vertexShader:   STAR_CORONA_VERT,
    fragmentShader: STAR_CORONA_FRAG_LIVE,
  });
}

export const SunShader = {
  LIVE_SUN,
  createStarCoreMaterial,
  createStarCoronaMaterial,
  sunSeedFromId,
  emissionMeanFor,
  promColorFor,
  promSlotsFor,
};
