// GalaxyTerritoryShader — ARC GALAXY, krok G2-3 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-15 (a); rama F5 A/B): literały GLSL
// terytorium na płycie galaktyki — płaszczyzna „rozlanego światła” jednego właściciela i zasłona granicy.
//   • PŁASZCZYZNA (A): pole wpływu właściciela z tekstury 1-kanałowej (`uField`, siatka `TerritoryField`, filtr liniowy) →
//     miękkie światło: RDZEŃ (pole ≥ 2,6 ISO) `uPoolA × uCoreMult`, ku izolinii gaśnie do `uPoolA × uFront` (front), cienka jasna KRAWĘDŹ
//     z gradientu pola (odległość od izolinii w px ekranu: `(f − ISO) / fwidth(f)` — stała grubość przy każdym zoomie),
//     gorący biały SZEW SPORNY tam, gdzie pole właściciela równa się maksimum pól pozostałych (`uOthers`) i oba są ponad ISO
//     (połowa jasności na każdą stronę — rysują go obie płaszczyzny, addytywnie), oddech krycia 1–2 % (`uBreath`), puls
//     krawędzi przy wojnie (`uWar` — wrogość to modyfikator, barwa zostaje tożsamością imperium); tryb ZARYS (`uOutline`,
//     wywiad `rumor`) — sama krawędź w barwie przekazanej przez wołającego (rola HUD `dim`), bez światła i bez szwu.
//   • ZASŁONA (B): niskie półprzezroczyste pasy wyciągnięte z pętli izolinii, krycie gaśnie z wysokością (`aV` 0 → 1).
// ⚠ Moduł BEZ IMPORTÓW (wzór `StarPointShader` / chunków głębi V4): chunki głębi logarytmicznej nakłada WOŁAJĄCY
//   (`GalaxyTerritory`, flaga `sceneDepthUnification`) — obie siatki są uczestnikami sceny (test głębi, bez zapisu).
// ⚠ Backticka nie wolno wstawić do literału GLSL.

export const TERRITORY_PLANE_VERT = `
        uniform vec2  uGridOrigin;
        uniform float uCell;
        uniform vec2  uGridN;
        varying vec2  vUv;

        void main() {
          vec2 g = (position.xz - uGridOrigin) / uCell + 0.5;
          vUv = g / uGridN;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

export const TERRITORY_PLANE_FRAG = `
        uniform sampler2D uField;
        uniform sampler2D uOthers;
        uniform float uHasOthers;
        uniform vec3  uColor;
        uniform vec3  uSeamColor;
        uniform float uIso;
        uniform float uPoolA;
        uniform float uCoreMult;
        uniform float uFront;
        uniform float uRimPx;
        uniform float uRimI;
        uniform float uSeamPx;
        uniform float uSeamI;
        uniform float uSeamWhite;
        uniform float uSeamHatch;
        uniform float uRimOverlap;
        uniform float uBreath;
        uniform float uTime;
        uniform float uPhase;
        uniform float uOutline;
        uniform float uWar;
        uniform float uFade;
        varying vec2  vUv;

        const float HATCH_PX = 4.0;   // okres kreskowania szwu (styl 1) w pikselach ekranu

        void main() {
          float f = texture2D(uField, vUv).r;
          float o = uHasOthers > 0.5 ? texture2D(uOthers, vUv).r : 0.0;
          float fw = max(fwidth(f), 1e-5);
          float dpx = (f - uIso) / fw;
          float rim = 1.0 - smoothstep(0.0, uRimPx, abs(dpx));
          float inside = smoothstep(-1.0, 1.0, dpx);
          float core = smoothstep(uIso, uIso * 2.6, f);
          float dom = smoothstep(-0.05, 0.05, f - o);
          float pool = inside * dom * uPoolA * mix(uFront, uCoreMult, core);
          float d = f - o;
          float fwd = max(fwidth(d), 1e-5);
          float both = smoothstep(uIso * 0.9, uIso * 1.1, min(f, o));
          float seam = (1.0 - smoothstep(0.0, uSeamPx, abs(d / fwd))) * both * uHasOthers;
          float breath = 1.0 + uBreath * sin(uTime * 0.9 + uPhase);
          float war = 1.0 + uWar * 0.6 * (0.5 + 0.5 * sin(uTime * 3.4 + uPhase));
          float full = 1.0 - uOutline;
          // Styl szwu (TERR_SEAM_STYLE, wagi z seamStyleParams; styl 0 = 1/0/1 → wynik bit w bit dotychczasowy):
          //  • rimScale — krawędź w strefie nakładania (tam, gdzie leży cudze terytorium) × uRimOverlap,
          //  • hs — kreskowanie szwu: styczna = prostopadła do gradientu d; d płaszczyzny drugiego właściciela to -d,
          //    więc styczna zmienia znak, a paski obu płaszczyzn się dopełniają (suma = 1) bez dodatkowego uniformu.
          float ovl = smoothstep(uIso * 0.9, uIso * 1.1, o) * uHasOthers;
          float rimScale = 1.0 - ovl * (1.0 - uRimOverlap);
          vec2 gd = vec2(dFdx(d), dFdy(d));
          vec2 tn = gd / max(length(gd), 1e-12);
          float hs = smoothstep(0.45, 0.55, fract(dot(gl_FragCoord.xy, vec2(-tn.y, tn.x)) / HATCH_PX));
          vec3 c = uColor * (pool * breath * full + rim * uRimI * war * mix(1.0, 0.7, uOutline) * rimScale)
                 + uSeamColor * seam * uSeamI * 0.5 * full * uSeamWhite
                 + uColor * (seam * uSeamI * full * uSeamHatch * hs);
          if (max(max(c.r, c.g), c.b) < 0.0005) discard;
          gl_FragColor = vec4(c * uFade, 1.0);
        }
      `;

export const TERRITORY_CURTAIN_VERT = `
        attribute float aV;
        varying float vV;

        void main() {
          vV = aV;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;

export const TERRITORY_CURTAIN_FRAG = `
        uniform vec3  uColor;
        uniform float uA;
        uniform float uFade;
        uniform float uWar;
        uniform float uTime;
        varying float vV;

        void main() {
          float a = uA * pow(1.0 - clamp(vV, 0.0, 1.0), 1.6) * (1.0 + uWar * 0.4 * (0.5 + 0.5 * sin(uTime * 3.4)));
          if (a < 0.0005) discard;
          gl_FragColor = vec4(uColor * a * uFade, 1.0);
        }
      `;

export const GalaxyTerritoryShader = { TERRITORY_PLANE_VERT, TERRITORY_PLANE_FRAG, TERRITORY_CURTAIN_VERT, TERRITORY_CURTAIN_FRAG };
