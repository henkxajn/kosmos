// AtmosphereShader — materiał powłoki atmosfery + obiekt strojenia LIVE_ATMO (V3 / commit A0).
//
// A0 JEST JAŁOWY WIZUALNIE Z KONSTRUKCJI, nie z obietnicy. three kluczuje cache programów
// po TREŚCI ŹRÓDŁA shadera (WebGLShaderCache._getShaderStage → customVertexShaderID →
// getProgramCacheKey), więc identyczny string to identyczny WebGLProgram i identyczna
// klatka. Dlatego ATMO_VERT i ATMO_FRAG są przeniesione z ThreeRenderer.addPlanetMesh
// CO DO ZNAKU (z końcami linii włącznie) i keeper trzyma ich sumy SHA-256.
//
// ⚠ REGUŁA NA CAŁY SLICE (precedens V2 / T0): tych dwóch literałów SIĘ NIE RUSZA.
//   Bramka dnia i nocy dojdzie w A1 jako WARIANT OBOK (ATMO_FRAG_LIVE), a nie jako
//   modyfikacja w miejscu — bo kontrakt kill-switcha wymaga, żeby stan OFF był stanem
//   sprzed slice'u co do bajtu, a jedynym sposobem, żeby to ZAGWARANTOWAĆ, jest zostawić
//   je w spokoju. Jeśli któraś suma padnie, ktoś ruszył ścieżkę OFF i to jest defekt,
//   a nie planowana zmiana.
//   ⚠ Kopia OFF NIE jest „nieutwardzonym bliźniakiem" (removeColony:667, ReturnJump):
//   suma kontrolna zamienia ją w MIGAWKĘ — „poprawiono tylko jedną kopię" jest tu
//   zachowaniem PINOWANYM, a nie cichym rozjazdem.
//
// ⚠ Backticka nie wolno wstawić do literału GLSL — node --check przechodzi, a plik jest
//   zepsuty (złapane dwa razy w tym arcu).

import * as THREE from 'three';
import { atmoStrengthFor } from './AtmosphereLogic.js';

// ── Pokrętła ─────────────────────────────────────────────────────────────────
// ⚠ Gate stroi to JEDNYM tokenem z konsoli: KOSMOS.threeRenderer.atmoTuning.STRENGTH = 0.1
//   — _tickAtmoMaterials przepisuje wynik do uniformu uStrength KAŻDEJ klatki, więc zmiana
//   łapie się natychmiast, dla wszystkich planet, bez restartu i bez rebuildu materiału.
//   To jest jedyny NIEJAŁOWY dowód A0: rusztowanie jest podpięte, choć nic nie zmienia.
//
// ⚠ WSZYSTKIE CZTERY POLA SĄ W A0 ŻYWE — i dlatego jest ich cztery, a nie dziewięć.
//   TERM_WIDTH, TWILIGHT_MIX, NIGHT_FLOOR i FADE_PX_* są PODPISANE (D-V3a/d/e/f), ale
//   ich konsumentem jest shader z A1, więc wchodzą razem z nim. Lekcja V-266 (1079cd9):
//   pole zadeklarowane przed swoim czytelnikiem to zaślepka nazwana jak funkcja.
//
// ⚠ Wartości A0 są NEUTRALNE LICZBOWO (0.55 = dzisiejsze atmoStrength, mnożniki 1.0),
//   żeby ten commit nie zmienił ani jednego piksela. Podpisane wartości docelowe wchodzą
//   w A1 razem z bramką: STRENGTH → 0.38, THIN → 0.55, BREATHABLE → 1.00, DENSE → 1.35.
const LIVE_ATMO = {
  STRENGTH:           0.55,  // mistrz alfy powłoki (A1: → 0.38, prowizoryczne — kalibracja na gate)
  DENSITY_THIN:       1.00,  // mnożnik dla atmosphere === 'thin'       (A1: → 0.55)
  DENSITY_BREATHABLE: 1.00,  // mnożnik dla atmosphere === 'breathable' (A1: → 1.00)
  DENSITY_DENSE:      1.00,  // mnożnik dla atmosphere === 'dense'      (A1: → 1.35)
};

// Promień powłoki jako krotność promienia planety. ⚠ NIE jest pokrętłem (D-V3c/W3
// odrzucone): zwężenie pierścienia zepchnęłoby go w aliasing przy typowej tarczy na
// mapie układu, więc ta liczba zostaje stałą.
const ATMO_SCALE = 1.08;

// ⚠ glowColor jest NULL dla rocky/gas/ice w PLANET_TYPE_CONFIG (niezerowy tylko dla
//   hot_rocky), więc ten fallback łapie praktycznie każdą planetę skalistą i lodową.
//   Rozjazd z tablicą atmColors w PlanetShader.createUniforms jest ZGŁOSZONY (V-275),
//   nie naprawiany tutaj (D-V3o): zmiana koloru wszystkich planet naraz zabrudziłaby
//   gate'owi odczyt zmiany oświetleniowej.
const ATMO_FALLBACK_COLOR = 0x4488ff;
const ATMO_VERT = /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          varying float vFresnel;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vViewDir = normalize(-mvPos.xyz);
            float NdotV = dot(vNormal, vViewDir);
            float rim = 1.0 - abs(NdotV);
            vFresnel = rim * rim * rim;
            gl_Position = projectionMatrix * mvPos;
          }
        `;

const ATMO_FRAG = /* glsl */ `
          uniform vec3 uColor;
          uniform vec3 uLightDir;
          uniform float uStrength;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          varying float vFresnel;
          void main() {
            float fresnel = vFresnel;

            // Kąt słońca w tym punkcie atmosfery
            vec3 toLight = normalize(uLightDir - vWorldPos);
            float sunAngle = dot(vWorldNormal, toLight);

            // Dzień — jaśniejszy kolor od strony słońca
            float dayAtm = max(sunAngle, 0.0);
            vec3 dayAtmColor = mix(uColor, uColor * vec3(1.2, 1.1, 0.9), dayAtm * 0.6);

            // Terminator — pomarańczowy pas
            float atmTerminator = exp(-abs(sunAngle) / 0.18);
            atmTerminator = pow(atmTerminator, 1.5);
            vec3 terminatorColor = vec3(1.0, 0.45, 0.15);

            // Noc — ciemna atmosfera
            vec3 nightAtmColor = uColor * vec3(0.15, 0.18, 0.35);

            // Blend
            vec3 atmColor = mix(dayAtmColor, nightAtmColor, smoothstep(-0.1, 0.3, -sunAngle));
            atmColor = mix(atmColor, terminatorColor, atmTerminator * 0.65);

            // Glow na krawędzi
            float glow = fresnel * smoothstep(1.0, 0.6, fresnel);
            float alpha = glow * uStrength;

            gl_FragColor = vec4(atmColor, alpha);
          }
        `;

// ── Materiał powłoki ─────────────────────────────────────────────────────────
// ⚠ Uniformy są DOKŁADNIE te trzy, które powłoka ma dzisiaj. uTermWidth / uTwilightMix /
//   uNightFloor dojdą w A1 razem z ATMO_FRAG_LIVE, który jako jedyny je deklaruje.
// ⚠ uLightDir to POZYCJA ŚWIATOWA gwiazdy, nie kierunek — nazwa kłamie od zawsze,
//   a fragment liczy z niej kierunek per-fragment (normalize(uLightDir - vWorldPos)).
//   Wpisuje ją _syncPlanetMeshes i ten zapis stoi POZA flagą, bo jest sprzed slice'u
//   i karmi mieszankę koloru, z której ścieżka OFF nadal korzysta.
//   Wartość startowa (0,0,0) nie jest zepsuta: daje kierunek do początku świata, czyli
//   do gwiazdy, dopóki nie przyjdzie pierwszy physics:updated.
function createAtmosphereMaterial(planet) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:    { value: new THREE.Color(planet.visual?.glowColor ?? ATMO_FALLBACK_COLOR) },
      uLightDir: { value: new THREE.Vector3(0, 0, 0) },
      uStrength: { value: atmoStrengthFor(planet.atmosphere, LIVE_ATMO) },
    },
    vertexShader:   ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side:        THREE.BackSide,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });
}

export const AtmosphereShader = {
  LIVE_ATMO,
  ATMO_SCALE,
  ATMO_FALLBACK_COLOR,
  createAtmosphereMaterial,
};
