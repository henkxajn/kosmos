// LogDepthChunks — chunki LOGARYTMICZNEJ GŁĘBI dla ręcznie pisanych shaderów (V-267).
//
// ⚠ ZERO IMPORTÓW. To nie jest higiena, tylko warunek DOWODU: moduł wykonuje się pod
//   node, więc transformację da się sprawdzić WYKONANIEM, a nie lekturą (wzór
//   SunAnimationLogic.js / AtmosphereLogic.js). ThreeRenderer nie importuje się pod node
//   i GLSL nie jest wykonywalny w sweepie — gdyby te funkcje mieszkały w rendererze,
//   jedynym instrumentem zostałby pin tekstowy, a ten nie widzi KOLEJNOŚCI wstawek
//   (lekcja S4: shader nie kompilował się w ogóle, a wszystkie sprawdzane stringi BYŁY).
//
// ── Diagnoza (V-267) ────────────────────────────────────────────────────────────
// Renderer mapy układu ma `logarithmicDepthBuffer: true` (ThreeRenderer.js:228) przy
// kamerze near 0.001 / far 5000. three wstrzykuje `#define USE_LOGDEPTHBUF` do prefiksu
// KAŻDEGO nie-Raw materiału — ShaderMaterial włącznie (three.module.js:6173 i :6340) —
// więc define BYŁ obecny w tych shaderach od zawsze. Brakowało wyłącznie CIAŁ chunków.
// Skutek: sześć ręcznie pisanych materiałów pisało głębię STAŁOPRZECINKOWĄ (0,9967 przy
// d = 0,3 … 0,999999 przy d = 1850) do bufora, w którym wszystko z biblioteki pisze
// LOGARYTMICZNĄ (0,031 … 0,883). Przy `LessEqual` znaczy to jedno zdanie:
//
//   te sześć materiałów zachowuje się, JAKBY LEŻAŁY W NIESKOŃCZONOŚCI —
//   wszystko log-depth jest „przed" nimi, a one nie są przed niczym.
//
// Dlatego część z nich wygląda dziś POPRAWNIE (starfield i mgławica NAPRAWDĘ są
// w nieskończoności; powłoka atmosfery jest BackSide, więc „za własną planetą" też jest
// jej poprawną odpowiedzią), a część nie (rdzeń gwiazdy nie zasłania niczego, korona
// i chmury przegrywają z rzeczami, które są za nimi).
//
// ── Czego NIE trzeba wpinać po stronie JS ───────────────────────────────────────
// ⚠ `logDepthBufFC` nie wymaga ani jednej linii wiring-u. Renderer ustawia go
//   bezwarunkowo, gdy capability jest włączona (three.module.js:16658-16663), a
//   `WebGLUniforms.setValue` jest CICHYM no-opem dla uniformu, którego program nie ma
//   (:5466-5468). Wystarczy go ZADEKLAROWAĆ — robi to `logdepthbuf_pars_fragment`.
//
// ── Dlaczego PREREQ jest OBOWIĄZKOWY, a nie ostrożnościowy ──────────────────────
// ⚠ `logdepthbuf_vertex` woła `isPerspectiveMatrix( projectionMatrix )`, a ta funkcja
//   jest zdefiniowana w chunku <common> — którego NASZE shadery nie dołączają (to gołe
//   ciała ShaderMaterial, bez ani jednego `#include`). Sam chunk wierzchołka NIE
//   SKOMPILUJE SIĘ bez tej definicji. Dlatego `withLogDepthVertex` emituje PIĄTY blok,
//   też przepisany CO DO ZNAKU z <common> i też pinowany przeciwko bibliotece.
//   Chunków się przy tym NIE modyfikuje: pin „cztery teksty == cztery literały
//   z three.module.js" ma zostać prawdziwy przez cały arc.
//
// ── Granica: ten moduł obsługuje TYLKO renderer mapy układu ─────────────────────
// ⚠⚠ NIE STOSOWAĆ w PlanetGlobeRenderer / StratcomGalaxyRenderer / GlbSnapshotRenderer.
//   Żaden z nich nie ustawia `logarithmicDepthBuffer`, więc `logDepthBufFC` NIGDY nie
//   zostanie tam wgrany i uniform zostanie na 0 ⇒ `gl_FragDepth = log2(vFragDepth) * 0
//   * 0.5 = 0` dla KAŻDEGO fragmentu, czyli wszystko na najbliższej możliwej głębi.
//   Globus kolonii przestałby działać. To jest ODWRÓCENIE domowej reguły „znajdź
//   bliźniaka i utwardź go" (removeColony:667, ReturnJump) — tutaj bliźniaka trzeba
//   zostawić w spokoju, i dlatego pilnuje tego pin keepera, a nie komentarz.

// ── Teksty chunków — PRZEPISANE CO DO ZNAKU z src/lib/three.module.js ───────────
// ⚠ To KOPIA, nie odczyt `THREE.ShaderChunk`, wyłącznie po to, żeby moduł miał zero
//   importów (patrz nagłówek). Dryf po bumpie biblioteki łapie pin T0 keepera, który
//   wyciąga te same literały z three.module.js i porównuje je znak po znaku.
//   three r171 · `var logdepthbuf_* = "…"` w liniach 404-410.

/** <common> — definicja wołana przez LOGDEPTH_VERTEX. 68 znaków. */
export const LOGDEPTH_PREREQ_VERTEX =
  'bool isPerspectiveMatrix( mat4 m ) {\n\treturn m[ 2 ][ 3 ] == - 1.0;\n}';

/** three.module.js:408 — 87 znaków. */
export const LOGDEPTH_PARS_VERTEX =
  '#ifdef USE_LOGDEPTHBUF\n\tvarying float vFragDepth;\n\tvarying float vIsPerspective;\n#endif';

/** three.module.js:410 — 132 znaki. */
export const LOGDEPTH_VERTEX =
  '#ifdef USE_LOGDEPTHBUF\n\tvFragDepth = 1.0 + gl_Position.w;\n\tvIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );\n#endif';

/** three.module.js:406 — 125 znaków. */
export const LOGDEPTH_PARS_FRAGMENT =
  '#if defined( USE_LOGDEPTHBUF )\n\tuniform float logDepthBufFC;\n\tvarying float vFragDepth;\n\tvarying float vIsPerspective;\n#endif';

/** three.module.js:404 — 136 znaków. */
export const LOGDEPTH_FRAGMENT =
  '#if defined( USE_LOGDEPTHBUF )\n\tgl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;\n#endif';

// ── Bloki wstawiane (z ogranicznikami) ──────────────────────────────────────────
// ⚠ `stripLogDepth` usuwa DOKŁADNIE te stringi, więc round-trip jest tożsamością CO DO
//   BAJTU. Żaden z nich nie może wystąpić w źródle naturalnie — każdy zawiera token
//   USE_LOGDEPTHBUF, którego nie ma w ani jednym ręcznie pisanym shaderze tego repo.
const V_PARS_BLOCK = '\n' + LOGDEPTH_PREREQ_VERTEX + '\n' + LOGDEPTH_PARS_VERTEX + '\n';
const V_MAIN_BLOCK = '\n' + LOGDEPTH_VERTEX + '\n';
const F_PARS_BLOCK = '\n' + LOGDEPTH_PARS_FRAGMENT + '\n';
const F_MAIN_BLOCK = '\n' + LOGDEPTH_FRAGMENT + '\n';

/** Czy źródło zostało już przekształcone (albo samo deklaruje chunki). */
export function hasLogDepth(src) {
  return typeof src === 'string' && src.indexOf('USE_LOGDEPTHBUF') >= 0;
}

// ⚠ Kotwica, której NIE MA, musi być GŁOŚNA. Transformacja, która po cichu nic nie robi,
//   daje shader bez `gl_FragDepth` w scenie, która go wymaga — czyli dokładnie defekt,
//   który zamykamy, tylko trudniejszy do zauważenia. To są stałe modułowe, nie dane
//   z rozgrywki: brak kotwicy jest deterministyczny, więc rzut nie może zaskoczyć
//   gracza kodem, który przeszedł keeper i sondę.
function anchor(idx, what, src) {
  if (idx < 0) {
    throw new Error('[LogDepthChunks] brak kotwicy „' + what + '" w shaderze:\n' + src.slice(0, 160));
  }
  return idx;
}

/**
 * Wierzchołek: PREREQ + pars przed `void main`, ciało PO OSTATNIM przypisaniu
 * `gl_Position` (we wszystkich sześciu shaderach jest ono ostatnią instrukcją main).
 */
export function withLogDepthVertex(src) {
  if (typeof src !== 'string') throw new Error('[LogDepthChunks] vertex: oczekiwano stringa');
  if (hasLogDepth(src)) throw new Error('[LogDepthChunks] vertex: źródło JUŻ ma chunki (podwójna transformacja)');

  const m = anchor(src.indexOf('void main'), 'void main (vertex)', src);
  // ⚠ PARS najpierw: nie zawiera tokenu `gl_Position`, więc nie zatruwa kotwicy ciała.
  //   Odwrotna kolejność szukałaby `gl_Position.w` z WŁASNEJ wstawki.
  let out = src.slice(0, m) + V_PARS_BLOCK + src.slice(m);

  const p = anchor(out.lastIndexOf('gl_Position'), 'gl_Position (vertex)', src);
  const semi = anchor(out.indexOf(';', p), '; po gl_Position (vertex)', src);
  out = out.slice(0, semi + 1) + V_MAIN_BLOCK + out.slice(semi + 1);
  return out;
}

/**
 * Fragment: pars przed `void main`, ciało NA SAMEJ GÓRZE main.
 *
 * ⚠ „Na górze" NIE jest preferencją stylu, tylko WYMOGIEM. Żywa korona ma wczesne
 *   wyjście (`SunShader`: `if (I < 0.002) { gl_FragColor = …; return; }`) obejmujące
 *   ~25 % quada. Wstawka na dole zostawiłaby tam `gl_FragDepth` NIEZDEFINIOWANE —
 *   bez błędu kompilacji, za to ze śmieciową głębią w zewnętrznej ćwiartce korony.
 *   Z tego samego powodu three wstawia ten chunk wysoko we WSZYSTKICH swoich shaderach.
 *   `discard` (starfield, chmury) jest przy tej kolejności nieszkodliwy: odrzucony
 *   fragment nie zapisuje niczego, więc wcześniejszy zapis głębi nie ma skutku.
 */
export function withLogDepthFragment(src) {
  if (typeof src !== 'string') throw new Error('[LogDepthChunks] fragment: oczekiwano stringa');
  if (hasLogDepth(src)) throw new Error('[LogDepthChunks] fragment: źródło JUŻ ma chunki (podwójna transformacja)');

  const m = anchor(src.indexOf('void main'), 'void main (fragment)', src);
  let out = src.slice(0, m) + F_PARS_BLOCK + src.slice(m);

  const m2 = out.indexOf('void main', m);   // ten sam `void main`, przesunięty o PARS
  const brace = anchor(out.indexOf('{', m2), '{ otwierający main (fragment)', src);
  out = out.slice(0, brace + 1) + F_MAIN_BLOCK + out.slice(brace + 1);
  return out;
}

/**
 * Odwrotność obu powyższych. Istnieje wyłącznie jako INSTRUMENT: keeper dowodzi nią
 * `stripLogDepth(withLogDepth*(X)) === X` co do bajtu, czyli że ścieżka ON jest
 * DERYWACJĄ ścieżki OFF, a nie jej ręcznie utrzymywaną kopią. Dzięki temu sześć złotych
 * sum SHA-256 (SunShader ×4, AtmosphereShader ×2) przechodzi przez cały ten arc bez
 * zmiany — literałów nikt nie dotyka.
 */
export function stripLogDepth(src) {
  if (typeof src !== 'string') return src;
  return src
    .split(V_PARS_BLOCK).join('')
    .split(V_MAIN_BLOCK).join('')
    .split(F_PARS_BLOCK).join('')
    .split(F_MAIN_BLOCK).join('');
}

export const LogDepthChunks = {
  LOGDEPTH_PREREQ_VERTEX,
  LOGDEPTH_PARS_VERTEX,
  LOGDEPTH_VERTEX,
  LOGDEPTH_PARS_FRAGMENT,
  LOGDEPTH_FRAGMENT,
  hasLogDepth,
  withLogDepthVertex,
  withLogDepthFragment,
  stripLogDepth,
};
