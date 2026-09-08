// AtmosphereShader — materiał powłoki atmosfery + obiekt strojenia LIVE_ATMO (V3 / A0 + A1).
//
// ŚCIEŻKA OFF JEST JAŁOWA Z KONSTRUKCJI, nie z obietnicy. three kluczuje cache programów
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
// ⚠ WSZYSTKIE DZIEWIĘĆ PÓL JEST ŻYWYCH — czytane co klatkę przez _tickAtmoMaterials.
//   Pięć z nich (TERM_WIDTH, TWILIGHT_MIX, NIGHT_FLOOR, FADE_PX_*) weszło DOPIERO
//   tutaj, razem ze swoim czytelnikiem w ATMO_FRAG_LIVE — lekcja V-266 (1079cd9):
//   pole zadeklarowane przed swoim czytelnikiem to zaślepka nazwana jak funkcja.
const LIVE_ATMO = {
  // ⚠ PROWIZORYCZNE — do kalibracji na live gate. Bramka N·L kasuje nocną połowę
  //   pierścienia, ale dziennej nie przygasza wcale, więc „subtelniej w ogóle" to
  //   osobne cięcie: 0.55 → 0.38 (−31 %).
  STRENGTH:           0.38,  // mistrz alfy powłoki

  // ⚠ 0.18 NIE JEST nową magiczną liczbą: to termWidth używany dziś w OBU torach
  //   atmosfery (ATMO_FRAG niżej i PlanetShader.js:339). Jedno pokrętło steruje
  //   ZARAZEM szerokością zaniku i szerokością ciepłego pasa (D-V3d) — inaczej tint
  //   i zanik rozjechałyby się przy pierwszym strojeniu.
  TERM_WIDTH:         0.18,  // półszerokość rampy dzień/noc w N·L (±10,4° łuku)
  TWILIGHT_MIX:       0.35,  // udział ciepłego tintu na terminatorze (było 0.65)

  // ⚠ 0.0 jest FIZYCZNE i jest naprawą. To pokrętło istnieje wyłącznie jako furtka
  //   gate'u, gdyby „znika całkiem" czytało się jako skok. Podniesienie go wraca do
  //   defektu — i dodatkowo residual niesie wtedy chromę DNIA, bo wariant żywy nie ma
  //   już gałęzi koloru nocy (była martwa: alfa i tak ją gasiła).
  NIGHT_FLOOR:        0.0,   // rezydualna alfa po stronie nocnej

  DENSITY_THIN:       0.55,  // mnożnik dla atmosphere === 'thin' (najczęstszy wynik generatora)
  DENSITY_BREATHABLE: 1.00,  // mnożnik dla atmosphere === 'breathable' (planety, które gracza obchodzą)
  DENSITY_DENSE:      1.35,  // mnożnik dla atmosphere === 'dense' (rzadkie, mają prawo krzyczeć)

  // ⚠ NEUTRALNE DOMYŚLNIE (hi <= lo ⇒ discFade zwraca 1.0), ale ŻYWE — czytane co
  //   klatkę, więc gate włącza zanik małych tarcz dwoma tokenami z konsoli i widzi
  //   efekt bez restartu. Celuje w samo zgłoszenie: na mapie układu większość tarcz
  //   ma kilkanaście pikseli, a 2-pikselowe halo wokół 12-pikselowej kropki to jest
  //   ten „paciorkowy" efekt.
  FADE_PX_LO:         0,     // średnica tarczy [CSS px], poniżej której powłoka gaśnie całkiem
  FADE_PX_HI:         0,     // średnica tarczy [CSS px], powyżej której powłoka świeci pełnią
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

// ⚠ ZAMROŻONA MIGAWKA pokręteł SPRZED slice'u — wyłącznie dla ścieżki OFF.
//   Złapane SONDĄ przy A1: fabryka OFF liczyła siłę z LIVE_ATMO, więc po zmianie
//   mistrza na 0.38 stan OFF dawał uStrength 0.209 zamiast 0.55 — czyli TRZECI stan
//   („ani przed slice'em, ani po"), a nie rollback. Kill-switch ma przywracać stan
//   sprzed slice'u, więc te liczby NIE MOGĄ śledzić LIVE_ATMO i nie są pokrętłami.
//   Object.freeze, żeby konsola nie mogła ich przestawić przez pomyłkę.
const ATMO_OFF_KNOBS = Object.freeze({
  STRENGTH:           0.55,
  DENSITY_THIN:       1.00,
  DENSITY_BREATHABLE: 1.00,
  DENSITY_DENSE:      1.00,
});
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

// ── Wariant ŻYWY (A1) — bramka dnia i nocy ───────────────────────────────────
// ⚠ WARIANT OBOK, nie modyfikacja w miejscu. To jedyny sposób, żeby ZAGWARANTOWAĆ,
//   że OFF jest stanem sprzed slice'u co do bajtu — three kluczuje cache programów
//   po treści źródła, więc nietknięty string to nietknięty program.
// ⚠ Vertex jest WSPÓLNY (ATMO_VERT): A1 nie potrzebuje ani jednego nowego varyinga,
//   więc obie ścieżki mają jeden program wierzchołków.
const ATMO_FRAG_LIVE = /* glsl */ `
          uniform vec3 uColor;
          uniform vec3 uLightDir;
          uniform float uStrength;
          uniform float uTermWidth;
          uniform float uTwilightMix;
          uniform float uNightFloor;
          uniform float uDiscFade;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vWorldNormal;
          varying vec3 vWorldPos;
          void main() {
            // Fresnel PER-FRAGMENT (D-V3q). vFresnel liczony jest w vertexie na sferze
            // 32×32 i interpolowany, więc fasetuje przy tarczy wypełniającej ekran —
            // czyli w podglądzie obserwatorium, jedynym miejscu, gdzie to widać. Zero
            // nowych varyingów: vNormal i vViewDir już tu są, a vFresnel zostaje
            // policzony w ATMO_VERT (wspólnym, przypiętym hashem) i po prostu nieużyty.
            float NdotV = dot(normalize(vNormal), normalize(vViewDir));
            float rim = 1.0 - abs(NdotV);
            float fresnel = rim * rim * rim;

            // Kąt słońca w tym punkcie atmosfery (uLightDir to POZYCJA gwiazdy, nie kierunek).
            vec3 toLight = normalize(uLightDir - vWorldPos);
            float sunAngle = dot(vWorldNormal, toLight);

            // Dzień — jaśniejszy kolor od strony słońca.
            // ⚠ Gałęzi koloru NOCY tu nie ma i to jest zamierzone: alfa gasi te fragmenty
            //   do zera, więc mieszanie do granatu było liczeniem koloru, którego nikt
            //   nie zobaczy. Stara gałąź żyje w ATMO_FRAG (ścieżka OFF), nietknięta.
            float dayAtm = max(sunAngle, 0.0);
            vec3 atmColor = mix(uColor, uColor * vec3(1.2, 1.1, 0.9), dayAtm * 0.6);

            // Ciepły pas zmierzchu — TA SAMA szerokość co bramka (D-V3d). Bramka ma
            // w terminatorze wartość dokładnie 0.5, więc łuk sam przycisza się o połowę
            // i ląduje na krawędzi zaniku, czyli tam, gdzie w naturze jest.
            float atmTerminator = exp(-abs(sunAngle) / uTermWidth);
            atmTerminator = pow(atmTerminator, 1.5);
            atmColor = mix(atmColor, vec3(1.0, 0.45, 0.15), atmTerminator * uTwilightMix);

            // ⚠ BRAMKA N·L NA ALFIE — to jest cała naprawa (D-V3a/D-V3b).
            //   Przy AdditiveBlending (SrcAlpha, One) wkład na ekran = kolor × alfa, więc
            //   bramkowanie alfy i koloru jest arytmetycznie tym samym; alfa jest miejscem
            //   uczciwym, bo znaczy „ile atmosfery świeci".
            //   smoothstep, a nie clamp(N·L): twardy lambert gaśnie liniowo przez 90° łuku,
            //   czyli przygaszałby dzienny limb — tę część, która ma zostać.
            //   ⚠ NIE używamy geometrycznego cienia powłoki (N·L ≈ −0.93 przy skali 1.08):
            //   renderujemy KOLUMNĘ atmosfery, a jej masa rozpraszająca siedzi nisko
            //   i wchodzi w cień od razu za terminatorem (D-V3n).
            float dayGate = smoothstep(-uTermWidth, uTermWidth, sunAngle);
            dayGate = max(dayGate, uNightFloor);

            float glow = fresnel * smoothstep(1.0, 0.6, fresnel);
            float alpha = glow * uStrength * dayGate * uDiscFade;

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
      uStrength: { value: atmoStrengthFor(planet.atmosphere, ATMO_OFF_KNOBS) },
    },
    vertexShader:   ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side:        THREE.BackSide,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });
}

// ── Materiał ŻYWY (A1) ───────────────────────────────────────────────────────
// ⚠ Bramka flagi stoi u WOŁAJĄCEGO (ThreeRenderer.addPlanetMesh), a nie tutaj —
//   dokładnie jak przy liveGasShaders. Dzięki temu ten moduł nie importuje GameConfig
//   (a przez niego i18n), a przy fladze OFF materiał żywy NIE POWSTAJE W OGÓLE.
// ⚠ Cztery nowe uniformy istnieją WYŁĄCZNIE tutaj. Materiał ścieżki OFF ma dalej
//   dokładnie trzy — to jest sprawdzane sondą kompilacji i keeperem.
function createLiveAtmosphereMaterial(planet) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:       { value: new THREE.Color(planet.visual?.glowColor ?? ATMO_FALLBACK_COLOR) },
      uLightDir:    { value: new THREE.Vector3(0, 0, 0) },
      uStrength:    { value: atmoStrengthFor(planet.atmosphere, LIVE_ATMO) },
      uTermWidth:   { value: LIVE_ATMO.TERM_WIDTH },
      uTwilightMix: { value: LIVE_ATMO.TWILIGHT_MIX },
      uNightFloor:  { value: LIVE_ATMO.NIGHT_FLOOR },
      uDiscFade:    { value: 1.0 },
    },
    vertexShader:   ATMO_VERT,
    fragmentShader: ATMO_FRAG_LIVE,
    side:        THREE.BackSide,
    transparent: true,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });
}

export const AtmosphereShader = {
  LIVE_ATMO,
  ATMO_OFF_KNOBS,
  ATMO_SCALE,
  ATMO_FALLBACK_COLOR,
  createAtmosphereMaterial,
  createLiveAtmosphereMaterial,
};
