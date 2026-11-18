// KOSMOS — ARC COLONY SPHERE, krok CS-4a: SurfaceField (czysty silnik powierzchni) + podgląd dla właściciela.
// Plan: docs/design/COLONY_SPHERE_PLAN.md §1.I, §2, §3.4, D-CS-3, D-CS-16.
//
// B1  Determinizm: złote wartości evalAt (archetypy × ziarna × punkty) zapisane w tym pliku; te same wejścia →
//     identyczny wynik także po wyrzuceniu kontekstu z bufora LRU; bake dwa razy = te same bajty.
// B2  Pin źródła: z evalAt / classify / seaLevelOf / surfaceInfo / prepareSurface / fibonacciSphere nieosiągalna
//     żadna funkcja z sin/cos/tan/atan/asin/acos/pow/exp/log/hypot/cbrt/random ani operator potęgi (graf wywołań
//     deklaracji najwyższego poziomu; świadek: bakeEquirect JEST oflagowany). Pin importów: SurfaceField bez
//     importów i bez document/window/localStorage; SurfacePreviewLogic importuje tylko ./SurfaceField.js.
// B3  Pułapka w czasie wykonania: Math.sin/cos/… rzucają → prepare / evalAt / classify dla każdego archetypu przechodzą;
//     świadek: bakeEquirect pod pułapką rzuca.
// B4  classify totalny: każdy archetyp × siatka próbek (z NaN, poza zakresem, brak pól) → teren ∈ 10, biom ∈ wiersz;
//     KAŻDA klasa biomu wiersza osiągalna (literówka nazwy klasy = klasa martwa); null → wasteland; klasa spoza wiersza
//     → pierwsza klasa wiersza.
// B5  Terran: udział oceanu (e < seaLevel) na NIEZALEŻNYM zbiorze punktów w ±5 pp od waterCoverage (wiele ziaren
//     i pokryć); ten sam seed z innym pokryciem → inny poziom morza. Archetypy (162 punkty): scorched/barren/desert/
//     ice/volcanic bez oceanu; ice ≥ 60% ice_sheet; volcanic ≥ 2 volcano; cryo_haze jeziora głównie przy biegunach;
//     tidally_locked strona nocna lodowa (woda tylko w terminatorze, ≈ ½ ziaren — CS-4a tuning); icy_cracked ma
//     lineae; jungle: las dominuje.
// B6  bakeEquirect vs evalAt w środkach pikseli: zgodność biomu ≥ 99% (trygonometria vs arytmetyka, kwantyzacja 8 bit).
// B7  Bez podpięcia: żaden plik gry poza src/debug/ (i od CS-4b SurfaceCache + surface.worker) nie importuje SurfaceField /
//     SurfacePreviewLogic (świadek: debug
//     importuje); GameScene ma tylko aliasy csSurface / csSurfaceAll. Literały złotego kąta = Math.cos/sin (test).
// B8  Pomocniki konsoli: SurfacePreviewDebug importowalny pod node; previewBody na ciele z ziarnem; helpers CS
//     zwracają csSurface / csSurfaceAll.
//
// Tryb nagrania złotych wartości: node colony_sphere_surface_smoke.mjs --record

import '../headless/env.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
let pass = 0, fail = 0;
function assert(c, msg) { if (c) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const read = (rel) => { try { return readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

let SF = {}, DA = {}, PL = {};
try { SF = await import('../../utils/SurfaceField.js'); } catch (e) { SF = { __err: String(e?.message ?? e) }; }
try { DA = await import('../../data/BodyArchetypes.js'); } catch { DA = {}; }
try { PL = await import('../../utils/SurfacePreviewLogic.js'); } catch { PL = {}; }
const ROWS = Array.isArray(DA.BODY_ARCHETYPES) ? DA.BODY_ARCHETYPES : [];
const BY = DA.ARCHETYPE_BY_ID ?? {};
const SURF = ROWS.filter(a => a.family !== 'gas');
const ok = typeof SF.evalAt === 'function' && typeof SF.classify === 'function' && typeof SF.bakeEquirect === 'function';
assert(ok, `SurfaceField eksportuje evalAt / classify / bakeEquirect${SF.__err ? ' — ' + SF.__err : ''}`);
const TERR = new Set(['plains', 'mountains', 'ocean', 'forest', 'desert', 'tundra', 'volcano', 'crater', 'ice_sheet', 'wasteland']);
const paramsFor = (a, wc = 0.7) => ({ waterCoverage: a.id === 'terran' ? wc : null, palette: a.family === 'planetoid' ? (a.id === 'planetoid_icy' ? 'icy' : 'metallic') : null });

// ── B1 Determinizm ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nB1 determinizm');
const G_ARCH = ['terran', 'desert', 'volcanic', 'cryo_haze', 'rocky_cratered', 'icy_cracked', 'planetoid'];
const G_SEEDS = [1, 0x9e3779b9, 123456789];
const G_PTS = [[0, 1, 0], [1, 0, 0], [0.6, -0.48, 0.64], [-0.36, 0.48, -0.8]];
function goldenRows() {
  const out = [];
  for (const id of G_ARCH) for (const seed of G_SEEDS) for (const p of G_PTS) {
    const s = SF.evalAt(seed, BY[id], paramsFor(BY[id]), p[0], p[1], p[2]);
    out.push([id, seed, s.e, s.m, s.t, s.a]);
  }
  return out;
}
// Złote wartości nagrane ŚWIADOMIE po przebiegu strojenia CS-4a (2026-11-18, SURFACE_FIELD_VERSION 2): wygląd zmieniony celowo.
const GOLDEN = [["terran",1,0.2829359896232426,0.508988438139857,0,0.5],["terran",1,0.251918547442024,0.5028904048454221,1,0.5],["terran",1,0.09793597332324323,0.5768575030108192,0.7024654032776472,0.5],["terran",1,0.4433295763693895,0.11856429084917319,0.7354206277654165,0.5],["terran",2654435769,0.47752447254876684,0.3122171478526873,0,0.5],["terran",2654435769,0,0.9024143316911984,1,0.5],["terran",2654435769,0.616635845585761,0.5245079979200993,0.8677135550981685,0.5],["terran",2654435769,0.4847386310914456,0.5148332601503102,0.8205589245503777,0.5],["terran",123456789,0.8502989741858269,0.5514558482868606,0,0.5],["terran",123456789,0.6602921378380788,0.080774252196187,1,0.5],["terran",123456789,0.7878269785358634,0.868246759816149,0.8748380014174241,0.5],["terran",123456789,0.6597242592476427,1,0.8158974081384716,0.5],["desert",1,0.4643946667834722,0.4440752251830556,0.016419377217353485,0.5],["desert",1,0.6261644072759119,0.20342830663544986,0.9996783355379847,0.5],["desert",1,0.65975356644029,0.6366783719996402,0.7812295049232206,0.5],["desert",1,0.6734224950444571,0.3260255324248592,0.7833441490337234,0.5],["desert",2654435769,0.2762980090107771,0.42582646858333106,0,0.5],["desert",2654435769,0.587915233278332,0.13028280492281508,0.9719815486955353,0.5],["desert",2654435769,0.32178531571279373,1,0.7972331381814571,0.5],["desert",2654435769,0.39645651469542137,0,0.7695171652085289,0.14268570791859847],["desert",123456789,0.6826395817753567,0.4902325626832972,0,0.5],["desert",123456789,0.7614810418402607,0.21562545134548544,1,0.5],["desert",123456789,0.6698168156822328,0.672826165497193,0.7687757302739506,0.21818928989678088],["desert",123456789,0.4706534165746974,0.6223500190884165,0.7900666209278917,0.5],["volcanic",1,0.4063187706581362,0.015882867536024553,0.31111800727521716,0.5222265597907763],["volcanic",1,0.4987506663010934,0.048859536526577006,0.3342016755686039,0.5],["volcanic",1,0.7721332836185668,0.6933030991542558,0.785312169407979,0.5],["volcanic",1,0.6768069060128215,0.2283899154838361,0.45987294083868524,0.5],["volcanic",2654435769,0.5559648444402608,0.0028103676982979857,0.3019672573888086,0.5],["volcanic",2654435769,0.4717820856817407,0.3197792812048001,0.52384549684336,0.5],["volcanic",2654435769,0.504648614313274,0.013900475292489592,0.3097303327047427,0.5],["volcanic",2654435769,0.3324334892795524,0.6342742096400678,0.7439919467480474,0.5],["volcanic",123456789,0.5613950197778954,0.3093074415366411,0.5165152090756487,0.5],["volcanic",123456789,0.5249183065756942,0.012589414784550076,0.30881259034918507,0.5],["volcanic",123456789,0.459809577324309,0.010298645232083467,0.30720905166245843,0.5],["volcanic",123456789,0.7424552666461531,0.00018108579364660115,0.3001267600555526,0.5],["cryo_haze",1,0.2130520767413268,1,0.04298060425669377,0.5],["cryo_haze",1,0.7063928188659403,0.23202807936046543,0.9898937781155752,0.5],["cryo_haze",1,0.5376658488120195,0.9759648098755973,0.7342676695705178,0.5],["cryo_haze",1,0.6816739382413498,0.7551129386549649,0.7468600903844269,0.5],["cryo_haze",2654435769,0.1795653775915847,0.0885551965840713,0.012615162997211197,0.5],["cryo_haze",2654435769,0.44623123291053485,1,0.9448541116326677,0.5],["cryo_haze",2654435769,0.5654583623531384,1,0.8062603001503043,0.5],["cryo_haze",2654435769,0.39804340656241277,0.05208024310857201,0.7795510616834439,0.5],["cryo_haze",123456789,0.36567441685328905,0.5424141844873204,0,0.5],["cryo_haze",123456789,0.5108918242626,0.26814136050024495,0.9911520435773674,0.5],["cryo_haze",123456789,0.588251202425277,0.9192481765595044,0.7090222878706792,0.5],["cryo_haze",123456789,0.6933842759196267,0.09073720686313758,0.7970907165253008,0.5],["rocky_cratered",1,0.49625017343065386,1,0,0.5],["rocky_cratered",1,0.6584613173718823,0,1,0.5],["rocky_cratered",1,0.509682532745673,1,0.7696000000000001,0.5],["rocky_cratered",1,0.5510274681513099,0,0.7696000000000001,0.5],["rocky_cratered",2654435769,0.4299156252382339,1,0,0.4851496453145904],["rocky_cratered",2654435769,0.43419530392921596,1,1,0.5],["rocky_cratered",2654435769,0.41270920330491556,0,0.7696000000000001,0.5],["rocky_cratered",2654435769,0.46491017383199035,0,0.7696000000000001,0.14268570791859847],["rocky_cratered",123456789,0.5292651680156352,1,0,0.5],["rocky_cratered",123456789,0.4808834494362673,0,1,0.49630761522128947],["rocky_cratered",123456789,0.450765044920604,0,0.7696000000000001,0.21818928989678088],["rocky_cratered",123456789,0.567136962234617,1,0.7696000000000001,0.5],["icy_cracked",1,0.46035897017497907,0.0071038089346197085,0,0.5],["icy_cracked",1,0.5330380426253287,0.41130689918286967,1,0.5],["icy_cracked",1,0.47806112818351437,0.02679291262363412,0.7696000000000001,0.5],["icy_cracked",1,0.4678075876585745,0.073953109018759,0.7696000000000001,0.5],["icy_cracked",2654435769,0.43725983211146796,0.00623473094501952,0,0.5],["icy_cracked",2654435769,0.4397127694862169,0.0012589292453102266,1,0.5],["icy_cracked",2654435769,0.33732504244866585,0.18112904392335227,0.7696000000000001,0.5],["icy_cracked",2654435769,0.46382594536736726,0.10912069299668546,0.7696000000000001,0.5],["icy_cracked",123456789,0.5366726000331669,0.0027061351523617206,0,0.5],["icy_cracked",123456789,0.3718487503309855,0.40051251999271187,1,0.5],["icy_cracked",123456789,0.45024907357467625,0.0020822573260721117,0.7696000000000001,0.5],["icy_cracked",123456789,0.5523742343638348,0.0046891745838173364,0.7696000000000001,0.5],["planetoid",1,0.5233648349054488,0.2601689118604666,0,0.5],["planetoid",1,0.5230160639599345,0.01934088589463438,1,0.5],["planetoid",1,0.47882754121873927,0.00021289732025289536,0.7696000000000001,0.5],["planetoid",1,0.7265697381362017,0.010744259364516623,0.7696000000000001,0.6875213510753431],["planetoid",2654435769,0.48088955419592316,0.2813009720342204,0,0.2411922553431799],["planetoid",2654435769,0.5179169418798156,0.219528421606852,1,0.42389628436225835],["planetoid",2654435769,0.4590164345199594,0.030017689219463635,0.7696000000000001,0.4168395880276156],["planetoid",2654435769,0.5081438487766695,0.05131890263052078,0.7696000000000001,0.4312220086677566],["planetoid",123456789,0.609547017414356,0.05245651685364459,0,0.5],["planetoid",123456789,0.6032591080461861,0.32003839333095363,1,0.6626173530833529],["planetoid",123456789,0.6050616955340163,0.01722362815527204,0.7696000000000001,0.5216491866877845],["planetoid",123456789,0.5020742687348154,0.06384806017248795,0.7696000000000001,0.2755729263977985]];
if (process.argv.includes('--record')) { console.log(JSON.stringify(goldenRows())); process.exit(0); }
if (ok) {
  const now = goldenRows();
  const bad = Array.isArray(GOLDEN) ? now.filter((r, i) => JSON.stringify(r) !== JSON.stringify(GOLDEN[i])) : now;
  assert(Array.isArray(GOLDEN) && GOLDEN.length === now.length && bad.length === 0,
    `złote wartości evalAt (${now.length} próbek, 7 archetypów × 3 ziarna × 4 punkty) bit w bit${bad.length ? ' — różne: ' + bad.slice(0, 3).map(r => r[0] + '/' + r[1]).join(', ') : ''}`);
  // Wyrzucenie kontekstów z LRU (≥ 48 innych ziaren) → ponowne wyliczenie identyczne.
  for (let s = 0; s < 60; s++) SF.prepareSurface(900000 + s, BY.barren, null);
  const again = goldenRows();
  assert(JSON.stringify(again) === JSON.stringify(now), 'po wyrzuceniu z bufora LRU wynik identyczny (kontekst z ziarna, nie ze stanu)');
  const b1 = SF.bakeEquirect(4242, BY.terran, { waterCoverage: 0.6 }, 64, 32), b2 = SF.bakeEquirect(4242, BY.terran, { waterCoverage: 0.6 }, 64, 32);
  assert(b1.length === 64 * 32 * 4 && b1.every((v, i) => v === b2[i]), 'bakeEquirect: dwa wywołania → te same bajty (RGBA8, w·h·4)');
}

// ── B2 Pin źródła ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nB2 pin źródła (graf wywołań + importy)');
const SRC = strip(read('src/utils/SurfaceField.js'));
const FORBID = /Math\.(sin|cos|tan|atan2?|asin|acos|pow|exp|expm1|log\w*|hypot|cbrt|sinh|cosh|tanh|random)\b|\*\*/;
const decls = [];
const declRe = /^(?:export\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=)/gm;
let mm;
while ((mm = declRe.exec(SRC))) decls.push({ name: mm[1] ?? mm[2] ?? mm[3], at: mm.index });
const bodies = new Map(decls.map((d, i) => [d.name, SRC.slice(d.at, i + 1 < decls.length ? decls[i + 1].at : SRC.length)]));
function reachable(roots) {
  const seen = new Set(), q = [...roots];
  while (q.length) {
    const n = q.pop(); if (seen.has(n) || !bodies.has(n)) continue; seen.add(n);
    for (const id of bodies.get(n).match(/\b[A-Za-z_]\w*\b/g) ?? []) if (bodies.has(id) && !seen.has(id)) q.push(id);
  }
  return seen;
}
const ROOTS = ['evalAt', 'classify', 'seaLevelOf', 'surfaceInfo', 'prepareSurface', 'fibonacciSphere'];
const reach = reachable(ROOTS);
const dirty = [...reach].filter(n => FORBID.test(bodies.get(n)));
assert(SRC.length > 0 && ROOTS.every(r => reach.has(r)) && reach.has('simplex3') && reach.has('craterLayer') && reach.has('RECIPES') && reach.size >= 30,
  `graf wywołań ścieżki rozgrywki zbudowany (${reach.size} deklaracji, w tym simplex3 / craterLayer / RECIPES)`);
assert(reach.size > 0 && dirty.length === 0, `ścieżka rozgrywki bez trygonometrii / pow / exp / log / ** (D-CS-16)${dirty.length ? ' — ' + dirty.join(', ') : ''}`);
assert(bodies.has('bakeEquirect') && FORBID.test(bodies.get('bakeEquirect')) && !reach.has('bakeEquirect'),
  'świadek: bakeEquirect używa trygonometrii (detektor działa) i jest poza ścieżką rozgrywki');
assert(SRC.length > 0 && !/^\s*import\b/m.test(SRC) && !/\bimport\s*\(/.test(SRC) && !/\b(document|window|localStorage|globalThis)\b/.test(SRC),
  'SurfaceField: zero importów, bez document / window / localStorage (worker-safe, CS-4b)');
const PSRC = strip(read('src/utils/SurfacePreviewLogic.js'));
const pImports = [...PSRC.matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map(x => x[1]);
assert(PSRC.length > 0 && pImports.length === 1 && pImports[0] === './SurfaceField.js' && !/Math\.random|\bdocument\b/.test(PSRC),
  `SurfacePreviewLogic importuje tylko ./SurfaceField.js, bez DOM i Math.random (${pImports.join(', ')})`);

// ── B3 Pułapka w czasie wykonania ───────────────────────────────────────────────────────────────────────────────
console.log('\nB3 pułapka Math.* w czasie wykonania');
if (ok) {
  const NAMES = ['sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'hypot', 'cbrt', 'random'];
  const saved = Object.fromEntries(NAMES.map(n => [n, Math[n]]));
  let err = null, witness = false;
  for (const n of NAMES) Math[n] = () => { throw new Error('Math.' + n); };
  try {
    for (const a of ROWS) {
      const seed = 777000 + ROWS.indexOf(a);
      const sea = SF.seaLevelOf(seed, a, paramsFor(a));
      for (const p of G_PTS) SF.classify(SF.evalAt(seed, a, paramsFor(a), p[0], p[1], p[2]), a, sea);
      SF.surfaceInfo(seed, a, paramsFor(a));
    }
    SF.fibonacciSphere(500);
  } catch (e) { err = e; }
  try { SF.bakeEquirect(1, BY.barren, null, 8, 4); } catch { witness = true; }
  Object.assign(Math, saved);
  assert(err === null, `prepare / evalAt / classify / surfaceInfo / fibonacciSphere pod pułapką dla ${ROWS.length} archetypów${err ? ' — ' + err.message : ''}`);
  assert(witness, 'świadek: bakeEquirect pod pułapką rzuca (pułapka działa)');
}

// ── B4 classify totalny ─────────────────────────────────────────────────────────────────────────────────────────
console.log('\nB4 classify totalny');
if (ok) {
  const vals = [0, 0.03, 0.1, 0.2, 0.3, 0.36, 0.4, 0.5, 0.55, 0.6, 0.62, 0.66, 0.7, 0.72, 0.76, 0.8, 0.84, 0.9, 0.95, 1];
  const odd = [NaN, -1, 2, undefined];
  let badTerr = 0, badBiome = 0, n = 0;
  const dead = [];
  for (const a of ROWS) {
    const classes = new Set((a.biomes ?? []).map(b => b.class)), seen = new Set();
    for (const sea of [-1, 0.2, 0.5, 0.75]) for (const e of vals) for (const m of vals) for (const t of [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.55, 0.7, 0.8, 0.95, 1]) for (const av of [0.2, 0.5, 0.7, 0.9]) {
      const r = SF.classify({ e, m, t, a: av }, a, sea); n++;
      if (!TERR.has(r.terrain)) badTerr++;
      if (!classes.has(r.biome)) badBiome++;
      seen.add(r.biome);
    }
    for (const x of odd) for (const r of [SF.classify({ e: x, m: x, t: x, a: x }, a, x), SF.classify({}, a, 0.5), SF.classify(null, a, 0.5)]) {
      n++; if (!TERR.has(r.terrain)) badTerr++; if (!classes.has(r.biome)) badBiome++;
    }
    for (const c of classes) if (!seen.has(c)) dead.push(a.id + '.' + c);
  }
  assert(ROWS.length === 21 && n > 100000 && badTerr === 0 && badBiome === 0, `${n} klasyfikacji (21 wierszy, z NaN / poza zakresem / brak pól): teren ∈ 10, biom ∈ wiersz`);
  assert(dead.length === 0, `każda klasa biomu każdego wiersza osiągalna${dead.length ? ' — martwe: ' + dead.join(', ') : ''}`);
  const nul = SF.classify({ e: 0.5 }, null, 0.5), unk = SF.classify({ e: 0.5, m: 0.5, t: 0.5, a: 0.5 }, { id: 'nope', biomes: [{ class: 'x', terrain: 'lava' }] }, 0.5);
  assert(nul.terrain === 'wasteland' && unk.terrain === 'wasteland', 'brak wiersza / teren spoza 10 → wasteland');
  const fb = SF.classify({ e: 0.5, m: 0.5, t: 0.5, a: 0.5 }, { id: 'nope', biomes: [{ class: 'x', terrain: 'plains' }, { class: 'y', terrain: 'ocean' }] }, 0.5);
  assert(fb.biome === 'x' && fb.terrain === 'plains', `klasa spoza wiersza → PIERWSZA klasa wiersza (biom zawsze z tabeli; ${fb.biome}/${fb.terrain})`);
}

// ── B5 Ocean terran + sanity archetypów ─────────────────────────────────────────────────────────────────────────
console.log('\nB5 ocean terran ±5 pp + sanity archetypów');
if (ok) {
  const T = BY.terran;
  const pts = SF.fibonacciSphere(1500);
  let worst = 0, n = 0;
  for (let k = 1; k <= 30; k++) {
    const seed = Math.imul(k, 2654435761) >>> 0, wc = +(0.15 + 0.75 * (k / 30)).toFixed(3), p = { waterCoverage: wc };
    const sea = SF.seaLevelOf(seed, T, p);
    let wet = 0;
    for (let i = 0; i < 1500; i++) if (SF.evalAt(seed, T, p, pts[i * 3 + 2], pts[i * 3 + 1], -pts[i * 3]).e < sea) wet++;
    worst = Math.max(worst, Math.abs(wet / 1500 - wc)); n++;
  }
  assert(n === 30 && worst <= 0.05, `terran: |ocean − waterCoverage| ≤ 5 pp na niezależnym zbiorze (30 ziaren, pokrycie 0.17–0.90; max ${(100 * worst).toFixed(2)} pp)`);
  const s1 = SF.seaLevelOf(31337, T, { waterCoverage: 0.3 }), s2 = SF.seaLevelOf(31337, T, { waterCoverage: 0.85 });
  assert(s2 > s1, `ten sam seed, inne pokrycie → wyższy poziom morza (${s1.toFixed(3)} → ${s2.toFixed(3)}; klucz kontekstu niesie waterCoverage)`);
  const P162 = SF.fibonacciSphere(162);
  const census = (id, seed) => {
    const a = BY[id], p = paramsFor(a), sea = SF.seaLevelOf(seed, a, p), c = {}, polarLake = { polar: 0, all: 0 }, night = { ice: 0, all: 0 };
    for (let i = 0; i < 162; i++) {
      const x = P162[i * 3], y = P162[i * 3 + 1], z = P162[i * 3 + 2];
      const r = SF.classify(SF.evalAt(seed, a, p, x, y, z), a, sea);
      c[r.terrain] = (c[r.terrain] ?? 0) + 1;
      if (r.terrain === 'ocean') { polarLake.all++; if (Math.abs(y) > 0.5) polarLake.polar++; }
      if (x < -0.5) { night.all++; if (r.terrain === 'ice_sheet') night.ice++; }
    }
    return { c, polarLake, night };
  };
  const seeds = [11, 2024, 0xabcdef, 987654321];
  const dry = [];
  for (const id of ['scorched', 'barren', 'desert', 'ice', 'volcanic', 'hothouse', 'rocky_cratered', 'volcanic_moon', 'icy_cracked', 'icy_cratered', 'planetoid', 'planetoid_icy'])
    for (const s of seeds) if (census(id, s).c.ocean) dry.push(id + '/' + s);
  assert(dry.length === 0, `bez oceanu: scorched / barren / desert / ice / volcanic / hothouse / księżyce bez atmosfery / planetoidy${dry.length ? ' — ' + dry.join(', ') : ''}`);
  const iceMin = Math.min(...seeds.map(s => census('ice', s).c.ice_sheet ?? 0));
  assert(iceMin >= 0.6 * 162, `ice: ≥ 60% ice_sheet na 162 punktach (min ${iceMin})`);
  const volMin = Math.min(...seeds.map(s => census('volcanic', s).c.volcano ?? 0));
  assert(volMin >= 2, `volcanic: ≥ 2 punkty volcano na 162 (min ${volMin})`);
  const cry = seeds.map(s => census('cryo_haze', s).polarLake);
  const cl = cry.reduce((a, b) => ({ polar: a.polar + b.polar, all: a.all + b.all }), { polar: 0, all: 0 });
  assert(cl.all >= 4 && cl.polar / cl.all >= 0.7, `cryo_haze: jeziora metanu są, ≥ 70% przy biegunach (|y| > 0.5: ${cl.polar}/${cl.all})`);
  const tn = seeds.map(s => census('tidally_locked', s).night);
  const tl = tn.reduce((a, b) => ({ ice: a.ice + b.ice, all: a.all + b.all }), { ice: 0, all: 0 });
  assert(tl.all > 0 && tl.ice / tl.all >= 0.9, `tidally_locked: strona nocna (x < −0.5) lodowa ≥ 90% (${tl.ice}/${tl.all})`);
  const lin = Math.min(...seeds.map(s => census('icy_cracked', s).c.tundra ?? 0));
  assert(lin >= 3, `icy_cracked: lineae (tundra) na każdym ziarnie (min ${lin} z 162)`);
  const jg = seeds.map(s => census('jungle', s).c);
  assert(jg.every(c => (c.forest ?? 0) === Math.max(...Object.values(c))), 'jungle: las dominuje na każdym ziarnie');
}

// ── B6 bake vs evalAt ───────────────────────────────────────────────────────────────────────────────────────────
console.log('\nB6 bakeEquirect vs evalAt w środkach pikseli');
if (ok) {
  const w = 128, h = 64;
  let worst = 1, worstId = '';
  for (const a of SURF) for (const seed of [5, 0xfeedbee]) {
    const p = paramsFor(a, 0.55), b = SF.bakeEquirect(seed, a, p, w, h), sea = SF.seaLevelOf(seed, a, p);
    let agree = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - ((j + 0.5) / h) * Math.PI;
      const s = SF.evalAt(seed, a, p, Math.cos(lon) * Math.cos(lat), Math.sin(lat), Math.sin(lon) * Math.cos(lat));
      const k = (j * w + i) * 4;
      if (SF.classify(s, a, sea).biome === SF.classify({ e: b[k] / 255, m: b[k + 1] / 255, t: b[k + 2] / 255, a: b[k + 3] / 255 }, a, sea).biome) agree++;
    }
    const r = agree / (w * h);
    if (r < worst) { worst = r; worstId = a.id + '/' + seed; }
  }
  assert(SURF.length === 18 && worst >= 0.99, `zgodność biomu bake ↔ evalAt ≥ 99% (18 archetypów × 2 ziarna; najgorzej ${(100 * worst).toFixed(2)}% ${worstId})`);
}

// ── B7 Bez podpięcia + stałe ────────────────────────────────────────────────────────────────────────────────────
console.log('\nB7 bez podpięcia do gry');
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(m?js)$/.test(n)) out.push(p); }
  return out;
}
const files = walk(path.join(REPO, 'src')).map(p => path.relative(REPO, p).replace(/\\/g, '/'));
const importers = files.filter(f => /(SurfaceField|SurfacePreviewLogic)\.js['"]/.test(strip(read(f))));
// CS-4b: SurfaceCache (jedyne wejście do map) i jego worker importują SurfaceField z założenia; ich własny brak
// podpięcia pilnuje colony_sphere_cache_smoke (C6).
const CS4B_OWNERS = ['src/systems/SurfaceCache.js', 'src/workers/surface.worker.js'];
const wired = importers.filter(f => !f.startsWith('src/debug/') && !f.startsWith('src/testing/') && f !== 'src/utils/SurfacePreviewLogic.js'
  && !CS4B_OWNERS.includes(f));
assert(importers.includes('src/debug/SurfacePreviewDebug.js'), 'świadek: SurfacePreviewDebug importuje SurfaceField');
assert(wired.length === 0, `żaden plik gry (systems / renderer / ui / scenes / …) nie importuje SurfaceField${wired.length ? ' — ' + wired.join(', ') : ''}`);
const gs = strip(read('src/scenes/GameScene.js'));
assert(/window\.csSurface\s*=\s*window\.KOSMOS\.debug\?\.csSurface;/.test(gs) && /window\.csSurfaceAll\s*=\s*window\.KOSMOS\.debug\?\.csSurfaceAll;/.test(gs),
  'GameScene: aliasy window.csSurface / csSurfaceAll (jedyny ślad w scenie)');
const g = Math.PI * (3 - Math.sqrt(5));
const lit = (name) => { const r = SRC.match(new RegExp(`const ${name} = (-?[0-9.]+);`)); return r ? +r[1] : NaN; };
assert(lit('GOLDEN_COS') === Math.cos(g) && lit('GOLDEN_SIN') === Math.sin(g), 'literały złotego kąta = Math.cos / Math.sin(π(3 − √5)) (po stronie testu)');
assert(JSON.stringify(SF.LOD_SIZES) === JSON.stringify({ hero: [1024, 512], body: [256, 128], planetoid: [128, 64] }), 'LOD_SIZES 1024×512 / 256×128 / 128×64');

// ── B8 Pomocniki konsoli ────────────────────────────────────────────────────────────────────────────────────────
console.log('\nB8 pomocniki konsoli');
try {
  globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };
  const D = await import('../../debug/SurfacePreviewDebug.js');
  const body = { type: 'planet', name: 'T', bodyArchetype: 'terran', surfaceSeed: 99, waterCoverage: 0.66, waterBand: 'oceanic' };
  const p = D.previewBody(body, 32, 16);
  const gas = D.previewBody({ type: 'planet', bodyArchetype: 'gas_cold', surfaceSeed: 1 }, 8, 4);
  assert(p && p.rgba.length === 32 * 16 * 4 && p.arch.id === 'terran' && Math.abs((p.shares.ocean ?? 0) + (p.shares.ice_sheet ?? 0) - 0.66) < 0.2 && gas === null,
    'previewBody: terran → RGBA 32×16 z udziałami terenów; gaz → null (poza zakresem)');
  const CS = await import('../../debug/ColonySphereDebug.js');
  const h = CS.colonySphereDebugHelpers();
  assert(typeof h.csSurface === 'function' && typeof h.csSurfaceAll === 'function', 'colonySphereDebugHelpers() zwraca csSurface / csSurfaceAll');
  const pal = PL.roleColorsFor?.(BY.planetoid, { palette: 'carbonaceous', variation: { albedo: 1 } });
  assert(Array.isArray(pal?.regolith) && pal.regolith[0] === 0x3b, 'podgląd planetoidy barwi regolit paletą wiersza (carbonaceous #3b3633)');
} catch (e) { assert(false, `B8: import / wywołanie rzuciło (${e?.message ?? e})`); }

console.log(`\n=== colony_sphere_surface_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
