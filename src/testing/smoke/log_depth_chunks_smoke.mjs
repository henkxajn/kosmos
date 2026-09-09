// Chunki logarytmicznej głębi — V4 / D0 (rusztowanie transformacji). Uruchom:
//   node src/testing/smoke/log_depth_chunks_smoke.mjs
//
// ⚠ Ziarnistość jak w całym arcu (VISUALS_PLAN §Ustalenia proceduralne): ThreeRenderer
//   nie importuje się pod node, a GLSL nie jest wykonywalny w sweepie. Ten keeper jest
//   jednak WYKONANIOWY w części, która najbardziej tego wymaga — bo LogDepthChunks.js
//   ma ZERO importów i cała transformacja daje się przepuścić przez node. To był jedyny
//   powód, dla którego mieszka w osobnym module, a nie w rendererze.
//
// ⚠ D0 NIE MA ANI JEDNEGO CALL-SITE w kodzie gry i to jest zamierzone. Transformacja
//   ląduje sama, żeby czerwony keeper w D2 znaczył „ZASTOSOWANIE jest złe", a nigdy
//   „transformacja jest zła". Pinuje to T6 — i ten pin MA PAŚĆ w D2, razem z komentarzem
//   o powodzie (wzór: piny nieobecności w V3/A0 → piny obecności w A1).
//
// ⚠ Klasyczny fail-first nie istnieje dla commita, który TWORZY moduł: na HEAD keeper
//   nie załadowałby się w ogóle. Uczciwym zamiennikiem jest BATERIA MUTACYJNA
//   (VISUALS_PLAN §Metody weryfikacji, pkt 3) — uruchamiana osobno, wynik w commicie.
//
// Pokrycie:
//   T0  Pięć tekstów wobec src/lib/three.module.js — CZTERY chunki `logdepthbuf_*`
//       ORAZ definicja isPerspectiveMatrix wyjęta z chunku <common>. KONTROLA: mutacja
//       jednego znaku rozjeżdża porównanie; KONTROLA 2: ekstraktor naprawdę coś wyjął.
//   T0b PREREQ nie jest ostrożnością — LOGDEPTH_VERTEX WOŁA isPerspectiveMatrix, a żaden
//       z sześciu shaderów nie dołącza <common>. KONTROLA: token nie występuje w źródłach.
//   T1  Round-trip CO DO BAJTU na WSZYSTKICH literałach dostępnych dziś po nazwie
//       (SunShader ×4 vert/frag + AtmosphereShader ×2) plus korpus syntetyczny
//       odwzorowujący trzy shadery inline z ThreeRenderer. KONTROLA: strip czegoś,
//       co nie było transformowane, nie zmienia stringa.
//   T2  Kotwice ZNALEZIONE — transformacja realnie rośnie o długość wstawek. Pin przeciw
//       cichemu no-opowi (mutant, który się nie aplikuje, liczy się jako JAŁOWY).
//   T3  Fragment: wstawka NA GÓRZE main, powyżej pierwszej instrukcji. Pin na fixture
//       z WCZESNYM `return` (kształt żywej korony) — wstawka MUSI stać przed nim.
//   T4  Wierzchołek: wstawka PO ostatnim przypisaniu gl_Position, a PARS przed main.
//   T5  Podwójna transformacja RZUCA; brak kotwicy RZUCA. Cisza jest tu gorsza od błędu.
//   T6  ⚠ ODWROCONY W D2 WOBEC D0. W D0 pinowal ZERO call-site'ow (rusztowanie mialo
//       byc jalowe); w D2 jego czytelnicy istnieja, wiec pinuje OBECNOSC wpiecia we
//       WSZYSTKICH trzech modulach sceny ukladu. Powod zapisany, bo pin, ktory znika
//       bez sladu, wyglada potem jak zgubiony (wzor A0->A1 w keeperze atmosfery).
//       Niezmienne zostaja blizniaki BEZ log-depth (PlanetGlobeRenderer /
//       StratcomGalaxyRenderer / GlbSnapshotRenderer): ODWROCENIE reguly „utwardz
//       blizniaka" — tam chunki dalyby gl_FragDepth = 0 dla KAZDEGO fragmentu.
//   T7  WPIECIE (D2): flaga czytana FUNKCJA, obie sciezki KAZDEJ fabryki, derywacje
//       liczone RAZ na starcie modulu, mglawica przez depthTest zamiast chunkow,
//       zlote sumy sciezki OFF nietkniete, komentarz przy `return` korony poprawiony.

import fs from 'fs';
import {
  LOGDEPTH_PREREQ_VERTEX, LOGDEPTH_PARS_VERTEX, LOGDEPTH_VERTEX,
  LOGDEPTH_PARS_FRAGMENT, LOGDEPTH_FRAGMENT,
  hasLogDepth, withLogDepthVertex, withLogDepthFragment, stripLogDepth,
} from '../../renderer/LogDepthChunks.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const BT = String.fromCharCode(96);
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

const threeSrc  = read('../../lib/three.module.js');
const sunSrc    = read('../../renderer/SunShader.js');
const atmoSrc   = read('../../renderer/AtmosphereShader.js');
const chunkSrc  = read('../../renderer/LogDepthChunks.js');
const rendSrc   = read('../../renderer/ThreeRenderer.js');
const cfgSrc    = read('../../config/GameConfig.js');
const strip     = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const rendCode  = strip(rendSrc);
const sunCode   = strip(sunSrc);
const atmoCode  = strip(atmoSrc);

// Literał `var <name> = "…";` z three.module.js — jedna linia, standardowe escape'y.
const pullThree = (name) => {
  const pre = 'var ' + name + ' = ';
  const line = threeSrc.split(/\r?\n/).find(l => l.startsWith(pre));
  if (!line) return null;
  try { return JSON.parse(line.slice(pre.length).replace(/;\s*$/, '')); } catch (e) { return null; }
};
// Literał `NAME = /* glsl */ `…`` z naszych modułów shaderowych.
const pullGlsl = (src, name) => {
  const open = name + ' = /* glsl */ ' + BT;
  const k = src.indexOf(open);
  if (k < 0) return null;
  const start = k + open.length;
  const end = src.indexOf(BT, start);
  return end < 0 ? null : src.slice(start, end);
};

// ── T0 ───────────────────────────────────────────────────────────────────────
console.log('\nT0 — pięć tekstów przepisanych z three.module.js CO DO ZNAKU');
const VENDOR = {
  LOGDEPTH_PARS_VERTEX:   { ours: LOGDEPTH_PARS_VERTEX,   theirs: pullThree('logdepthbuf_pars_vertex'),   len: 87 },
  LOGDEPTH_VERTEX:        { ours: LOGDEPTH_VERTEX,        theirs: pullThree('logdepthbuf_vertex'),        len: 132 },
  LOGDEPTH_PARS_FRAGMENT: { ours: LOGDEPTH_PARS_FRAGMENT, theirs: pullThree('logdepthbuf_pars_fragment'), len: 125 },
  LOGDEPTH_FRAGMENT:      { ours: LOGDEPTH_FRAGMENT,      theirs: pullThree('logdepthbuf_fragment'),      len: 136 },
};
for (const [name, v] of Object.entries(VENDOR)) {
  ok(name + ': ekstraktor wyjął literał z biblioteki', typeof v.theirs === 'string' && v.theirs.length > 40);
  ok(name + ': długość ' + v.ours.length + ' == ' + v.len, v.ours.length === v.len);
  ok(name + ': identyczny z three.module.js', v.ours === v.theirs);
}
const common = pullThree('common');
ok('KONTROLA: chunk <common> wyjęty z biblioteki', typeof common === 'string' && common.length > 1000);
const iPM = common.indexOf('bool isPerspectiveMatrix');
const jPM = common.indexOf('}', common.indexOf('return m[ 2 ][ 3 ]')) + 1;
const vendorPrereq = iPM >= 0 && jPM > iPM ? common.slice(iPM, jPM) : null;
ok('LOGDEPTH_PREREQ_VERTEX: identyczny z definicją w <common>', LOGDEPTH_PREREQ_VERTEX === vendorPrereq);
ok('LOGDEPTH_PREREQ_VERTEX: długość 68', LOGDEPTH_PREREQ_VERTEX.length === 68);
ok('KONTROLA: mutacja jednego znaku rozjeżdża porównanie',
   LOGDEPTH_FRAGMENT.replace('0.5', '0.6') !== VENDOR.LOGDEPTH_FRAGMENT.theirs);

// ── T0b ──────────────────────────────────────────────────────────────────────
console.log('\nT0b — PREREQ jest WYMOGIEM kompilacji, nie ostrożnością');
ok('LOGDEPTH_VERTEX woła isPerspectiveMatrix', LOGDEPTH_VERTEX.includes('isPerspectiveMatrix( projectionMatrix )'));
ok('PREREQ definiuje tę funkcję', LOGDEPTH_PREREQ_VERTEX.includes('bool isPerspectiveMatrix( mat4 m )'));
ok('KONTROLA: SunShader.js nie dołącza <common> ani nie definiuje isPerspectiveMatrix',
   !sunSrc.includes('#include <common>') && !sunSrc.includes('isPerspectiveMatrix'));
ok('KONTROLA: AtmosphereShader.js tak samo',
   !atmoSrc.includes('#include <common>') && !atmoSrc.includes('isPerspectiveMatrix'));

// ── Korpus: prawdziwe literały + syntetyki odwzorowujące shadery inline ──────
// ⚠ Syntetyki istnieją, bo trzy shadery ThreeRenderera są dziś literałami INLINE
//   (nie mają nazw, więc nie da się ich wyciągnąć po nazwie). W D2 starfield zostanie
//   podniesiony do stałej modułowej i wejdzie tu jako PRAWDZIWE źródło.
const SYNTH = {
  'syn_points_vert': 'attribute float aSize;\nvarying vec3 vColor;\nvoid main() {\n  vColor = color;\n  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = aSize;\n  gl_Position  = projectionMatrix * mvPos;\n}\n',
  'syn_points_frag': 'varying vec3 vColor;\nvoid main() {\n  float I = 1.0;\n  if (I < 0.002) discard;\n  gl_FragColor = vec4(vColor * I, 1.0);\n}\n',
  'syn_nested_vert': 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position);\n  gl_Position = projectionMatrix * (modelViewMatrix * vec4(position, 1.0)); }',
  // Kształt ŻYWEJ KORONY: wczesne wyjście `return` w środku main (D-D6).
  'syn_early_return_frag': 'varying vec2 vP;\nuniform float uGain;\nvoid main() {\n  float d = length(vP);\n  float I = exp(-d);\n  if (I < 0.002) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }\n  gl_FragColor = vec4(uGain * I);\n}\n',
};
const REAL_VERT = ['STAR_CORE_VERT', 'STAR_CORE_VERT_LIVE', 'STAR_CORONA_VERT'].map(n => [n, pullGlsl(sunSrc, n)])
  .concat([['ATMO_VERT', pullGlsl(atmoSrc, 'ATMO_VERT')]]);
const REAL_FRAG = ['STAR_CORE_FRAG', 'STAR_CORE_FRAG_LIVE', 'STAR_CORONA_FRAG', 'STAR_CORONA_FRAG_LIVE'].map(n => [n, pullGlsl(sunSrc, n)])
  .concat([['ATMO_FRAG', pullGlsl(atmoSrc, 'ATMO_FRAG')], ['ATMO_FRAG_LIVE', pullGlsl(atmoSrc, 'ATMO_FRAG_LIVE')]]);

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — round-trip CO DO BAJTU (ścieżka ON jest DERYWACJĄ ścieżki OFF)');
const VERT_CASES = REAL_VERT.concat([['syn_points_vert', SYNTH.syn_points_vert], ['syn_nested_vert', SYNTH.syn_nested_vert]]);
const FRAG_CASES = REAL_FRAG.concat([['syn_points_frag', SYNTH.syn_points_frag], ['syn_early_return_frag', SYNTH.syn_early_return_frag]]);
ok('KONTROLA: korpus jest niepusty (6 vert + 8 frag)', VERT_CASES.length === 6 && FRAG_CASES.length === 8);
for (const [name, src] of VERT_CASES) {
  ok('vert ' + name + ': wyciągnięty', typeof src === 'string' && src.length > 40);
  if (typeof src !== 'string') continue;
  ok('vert ' + name + ': strip(with(X)) === X', stripLogDepth(withLogDepthVertex(src)) === src);
}
for (const [name, src] of FRAG_CASES) {
  ok('frag ' + name + ': wyciągnięty', typeof src === 'string' && src.length > 40);
  if (typeof src !== 'string') continue;
  ok('frag ' + name + ': strip(with(X)) === X', stripLogDepth(withLogDepthFragment(src)) === src);
}
ok('KONTROLA: strip nietkniętego źródła to tożsamość', stripLogDepth(SYNTH.syn_points_vert) === SYNTH.syn_points_vert);
ok('KONTROLA: strip po WŁASNEJ mutacji wstawki NIE wraca do X',
   stripLogDepth(withLogDepthVertex(SYNTH.syn_points_vert).replace('vFragDepth = 1.0', 'vFragDepth = 2.0')) !== SYNTH.syn_points_vert);

// ── T2 ───────────────────────────────────────────────────────────────────────
console.log('\nT2 — kotwice ZNALEZIONE (pin przeciw cichemu no-opowi)');
const V_GROWTH = LOGDEPTH_PREREQ_VERTEX.length + LOGDEPTH_PARS_VERTEX.length + LOGDEPTH_VERTEX.length + 5; // 5 × '\n'
const F_GROWTH = LOGDEPTH_PARS_FRAGMENT.length + LOGDEPTH_FRAGMENT.length + 4;                            // 4 × '\n'
for (const [name, src] of VERT_CASES) {
  if (typeof src !== 'string') continue;
  ok('vert ' + name + ': urósł dokładnie o ' + V_GROWTH + ' znaków', withLogDepthVertex(src).length - src.length === V_GROWTH);
  ok('vert ' + name + ': hasLogDepth po transformacji', hasLogDepth(withLogDepthVertex(src)));
}
for (const [name, src] of FRAG_CASES) {
  if (typeof src !== 'string') continue;
  ok('frag ' + name + ': urósł dokładnie o ' + F_GROWTH + ' znaków', withLogDepthFragment(src).length - src.length === F_GROWTH);
  ok('frag ' + name + ': hasLogDepth po transformacji', hasLogDepth(withLogDepthFragment(src)));
}
ok('KONTROLA: hasLogDepth na źródle sprzed transformacji jest FALSE',
   REAL_VERT.every(([, s]) => !hasLogDepth(s)) && REAL_FRAG.every(([, s]) => !hasLogDepth(s)));

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — fragment: wstawka NA GÓRZE main (wymóg wczesnego `return` korony)');
for (const [name, src] of FRAG_CASES) {
  if (typeof src !== 'string') continue;
  const out = withLogDepthFragment(src);
  const brace = out.indexOf('{', out.indexOf('void main'));
  const chunk = out.indexOf(LOGDEPTH_FRAGMENT);
  const between = out.slice(brace + 1, chunk);
  ok('frag ' + name + ': między `{` a chunkiem są SAME białe znaki', chunk > brace && between.trim() === '');
}
const earlyOut = withLogDepthFragment(SYNTH.syn_early_return_frag);
ok('fixture z wczesnym `return`: chunk STOI PRZED nim',
   earlyOut.indexOf(LOGDEPTH_FRAGMENT) < earlyOut.indexOf('return;'));
const liveCorona = pullGlsl(sunSrc, 'STAR_CORONA_FRAG_LIVE');
ok('KONTROLA: żywa korona NAPRAWDĘ ma wczesne wyjście (inaczej pin mierzy ciszę)',
   typeof liveCorona === 'string' && /if\s*\(I\s*<\s*0\.002\)/.test(liveCorona) && liveCorona.includes('return;'));
const liveCoronaOut = withLogDepthFragment(liveCorona);
ok('żywa korona: chunk PRZED jej wczesnym `return`',
   liveCoronaOut.indexOf(LOGDEPTH_FRAGMENT) < liveCoronaOut.indexOf('return;'));

// ── T4 ───────────────────────────────────────────────────────────────────────
console.log('\nT4 — wierzchołek: PARS przed main, ciało PO ostatnim gl_Position');
for (const [name, src] of VERT_CASES) {
  if (typeof src !== 'string') continue;
  const out = withLogDepthVertex(src);
  const pars = out.indexOf(LOGDEPTH_PARS_VERTEX);
  const prereq = out.indexOf(LOGDEPTH_PREREQ_VERTEX);
  const mainAt = out.indexOf('void main');
  const body = out.indexOf(LOGDEPTH_VERTEX);
  ok('vert ' + name + ': PREREQ i PARS przed `void main`', prereq >= 0 && pars > prereq && pars < mainAt);
  ok('vert ' + name + ': ciało chunku PO `void main`', body > mainAt);
  // ostatnie przypisanie gl_Position w ORYGINALE, przeniesione na wynik
  const srcLast = src.lastIndexOf('gl_Position');
  const tail = src.slice(srcLast);
  ok('vert ' + name + ': ciało chunku PO ostatnim gl_Position', body > out.indexOf(tail.slice(0, 24)));
}
ok('KONTROLA: PREREQ NIE trafia do fragmentu',
   FRAG_CASES.every(([, s]) => typeof s !== 'string' || !withLogDepthFragment(s).includes(LOGDEPTH_PREREQ_VERTEX)));

// ── T5 ───────────────────────────────────────────────────────────────────────
console.log('\nT5 — cisza jest gorsza od błędu: brak kotwicy i podwójna transformacja RZUCAJĄ');
ok('vert bez `void main` rzuca', throws(() => withLogDepthVertex('varying vec3 v;\n')));
ok('vert bez gl_Position rzuca', throws(() => withLogDepthVertex('void main() { float x = 1.0; }')));
ok('frag bez `void main` rzuca', throws(() => withLogDepthFragment('uniform float u;\n')));
ok('podwójna transformacja (vert) rzuca', throws(() => withLogDepthVertex(withLogDepthVertex(SYNTH.syn_points_vert))));
ok('podwójna transformacja (frag) rzuca', throws(() => withLogDepthFragment(withLogDepthFragment(SYNTH.syn_points_frag))));
ok('nie-string rzuca', throws(() => withLogDepthVertex(null)) && throws(() => withLogDepthFragment(42)));
ok('KONTROLA: poprawne źródło NIE rzuca', !throws(() => withLogDepthVertex(SYNTH.syn_points_vert)));

// ── T6 ───────────────────────────────────────────────────────────────────────
console.log('\nT6 — wpięcie OBECNE (⚠ odwrócone wobec D0) + bliźniaki BEZ log-depth');
const consumers = [];
for (const f of ['ThreeRenderer.js', 'SunShader.js', 'AtmosphereShader.js', 'GasGiantShader.js',
                 'PlanetGlobeRenderer.js', 'StratcomGalaxyRenderer.js', 'GlbSnapshotRenderer.js', 'PlanetShader.js']) {
  if (read('../../renderer/' + f).includes('LogDepthChunks')) consumers.push(f);
}
ok('konsumenci to DOKŁADNIE trzy moduły sceny układu: ' + consumers.join(', '),
   consumers.length === 3 && consumers.includes('ThreeRenderer.js') &&
   consumers.includes('SunShader.js') && consumers.includes('AtmosphereShader.js'));
// ⚠ ODWRÓCONA reguła bliźniaka: te trzy renderery NIE MAJĄ logarithmicDepthBuffer, więc
//   logDepthBufFC nigdy nie zostanie tam wgrany (zostanie 0) ⇒ gl_FragDepth = 0 dla
//   KAŻDEGO fragmentu. Ten pin ma przeżyć każdy następny slice.
for (const f of ['PlanetGlobeRenderer.js', 'StratcomGalaxyRenderer.js', 'GlbSnapshotRenderer.js']) {
  const s = read('../../renderer/' + f);
  ok('BLIŹNIAK ' + f + ': bez logarithmicDepthBuffer', !s.includes('logarithmicDepthBuffer'));
  ok('BLIŹNIAK ' + f + ': NIE importuje LogDepthChunks', !s.includes('LogDepthChunks'));
}
ok('KONTROLA: renderer mapy układu logarithmicDepthBuffer MA', rendSrc.includes('logarithmicDepthBuffer: true'));
ok('LogDepthChunks.js nie ma ANI JEDNEGO importu (warunek wykonywalności pod node)',
   !/^\s*import\s/m.test(chunkSrc));
ok('materiał bake (ortho, offscreen) ŚWIADOMIE bez chunków',
   rendCode.includes('vertexShader:   PlanetShader.bakeVertexShader') && !rendCode.includes('withLogDepthVertex(PlanetShader'));

// ── T7 ───────────────────────────────────────────────────────────────────────
console.log('\nT7 — wpięcie D2: flaga, obie ścieżki, derywacje raz, mgławica bez chunków');
ok('flaga czytana FUNKCJĄ, nie stałą modułową (inaczej konsola nie złapie się nawet po zmianie układu)',
   rendCode.includes('const logDepthOn = () => !!GAME_CONFIG.FEATURES?.sceneDepthUnification;'));
ok('idiom „brak klucza = OFF" (!! zamiast !== false)',
   /logDepthOn = \(\) => !!GAME_CONFIG/.test(rendCode) && !/sceneDepthUnification !== false/.test(rendCode));
ok('flaga istnieje w GameConfig i jest domyślnie ON', /sceneDepthUnification:\s*true/.test(strip(cfgSrc)));
ok('starfield: obie ścieżki przez flagę',
   rendCode.includes('logDepthOn() ? withLogDepthVertex(starVert)') && rendCode.includes('logDepthOn() ? withLogDepthFragment(starFrag)'));
ok('chmury: obie ścieżki przez flagę',
   rendCode.includes('logDepthOn() ? withLogDepthVertex(cloudVert)') && rendCode.includes('logDepthOn() ? withLogDepthFragment(cloudFrag)'));
ok('mgławica: depthTest wyłączany flagą, BEZ chunków (D-D3)',
   rendCode.includes('depthTest: !logDepthOn()') && !rendCode.includes('withLogDepthVertex(nebVert'));
ok('rdzeń i korona: logDepth przekazywany do OBU fabryk', (rendCode.match(/logDepth: logDepthOn\(\),/g) || []).length === 2);
ok('powłoka atmosfery: logDepth w OBU gałęziach dayNightAtmosphere',
   rendCode.includes('createLiveAtmosphereMaterial(planet, logDepthOn())') && rendCode.includes('createAtmosphereMaterial(planet, logDepthOn())'));
for (const [n, pair] of Object.entries({
  'rdzeń OFF':   ['STAR_CORE_VERT_LD : STAR_CORE_VERT', 'STAR_CORE_FRAG_LD : STAR_CORE_FRAG'],
  'rdzeń ŻYWY':  ['STAR_CORE_VERT_LIVE_LD : STAR_CORE_VERT_LIVE', 'STAR_CORE_FRAG_LIVE_LD : STAR_CORE_FRAG_LIVE'],
  'korona OFF':  ['STAR_CORONA_VERT_LD : STAR_CORONA_VERT', 'STAR_CORONA_FRAG_LD : STAR_CORONA_FRAG'],
  'korona ŻYWA': ['STAR_CORONA_VERT_LD : STAR_CORONA_VERT', 'STAR_CORONA_FRAG_LIVE_LD : STAR_CORONA_FRAG_LIVE'],
})) ok('SunShader — ' + n + ': obie ścieżki', pair.every(t => sunCode.includes(t)));
for (const [n, pair] of Object.entries({
  'powłoka OFF':  ['ATMO_VERT_LD : ATMO_VERT', 'ATMO_FRAG_LD : ATMO_FRAG'],
  'powłoka ŻYWA': ['ATMO_VERT_LD : ATMO_VERT', 'ATMO_FRAG_LIVE_LD : ATMO_FRAG_LIVE'],
})) ok('AtmosphereShader — ' + n + ': obie ścieżki', pair.every(t => atmoCode.includes(t)));
// ⚠ `node --check` NIE łapie użycia niezadeklarowanego parametru w ciele funkcji —
//   złapane realnie w tym slice: ciało fabryki OFF czytało `logDepth`, którego nie było
//   w sygnaturze (ReferenceError dopiero na żywej ścieżce).
ok('SunShader: obie fabryki DEKLARUJĄ logDepth', (sunCode.match(/logDepth = false/g) || []).length === 2);
ok('AtmosphereShader: obie fabryki DEKLARUJĄ logDepth', (atmoCode.match(/logDepth = false/g) || []).length === 2);
ok('derywacje liczone RAZ, na starcie modułu (7 w SunShader + 3 w AtmosphereShader)',
   (sunCode.match(/^const \w+_LD\s+= withLogDepth/gm) || []).length === 7 &&
   (atmoCode.match(/^const \w+_LD\s+= withLogDepth/gm) || []).length === 3);
ok('KONTROLA: literały ścieżki OFF NIETKNIĘTE (bez chunków w źródle)',
   !pullGlsl(sunSrc, 'STAR_CORE_FRAG').includes('USE_LOGDEPTHBUF') &&
   !pullGlsl(atmoSrc, 'ATMO_FRAG').includes('USE_LOGDEPTHBUF'));
ok('komentarz przy wczesnym `return` korony ZAKTUALIZOWANY (nie obiecuje już early-Z)',
   sunSrc.includes('KOREKTA (V4 / D2)') && sunSrc.includes('11,9 %'));


console.log('\n' + (fail ? 'FAIL' : 'OK') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
