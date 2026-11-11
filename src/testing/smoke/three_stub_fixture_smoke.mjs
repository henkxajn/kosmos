// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// three_stub_fixture_smoke — KEEPER Findingu 683 (ARC COMBAT VISUALS, decyzja właściciela 2026-11-11 przed CV-1c):
// stub `three` dla testów headless jest ŚLEDZONY w git i podpięty przez package.json, więc `npm ci` / `npm install`
// nigdy go nie kasuje.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TŁO: łańcuch GameCore → GroundUnitManager → GroundUnitFactory → GlbSnapshotRenderer importuje `three` (w grze z importmapy,
// pod node — z `node_modules`). Stub żył dotąd WYŁĄCZNIE w `node_modules/three` (gitignorowane); instalacja zależności
// normalizatora (sharp, glTF-Transform — D-CV-13) kasowała go, a każdy keeper importujący GameCore padał do ręcznego
// odtworzenia (CV-1b, Finding 683).
// NAPRAWA: stub w `src/testing/fixtures/three-stub/` (git) + `devDependencies.three = "file:src/testing/fixtures/three-stub"`
// ⇒ czysta instalacja tworzy `node_modules/three` jako ŁĄCZE do śledzonego folderu (wpis lockfile'a `link: true`).
// Zmierzone przy naprawie (2026-11-11, npm 11.9, node 24.14, Windows): `npm ci` na drzewie z łączem usuwa łącze, NIE treść
// folderu (sha256 trzech plików stubu przed = po), i tworzy je od nowa; sweep po świeżym `npm ci` — zielony.
//
// CO PINUJE:
//   S1 wskaźnik: package.json → devDependencies.three = "file:src/testing/fixtures/three-stub"; stub NIE jest w `dependencies`
//      (to nie zależność gry — gra bierze Three.js z importmapy).
//   S2 lockfile w zgodzie (bez tego `npm ci` odmawia): wpis `node_modules/three` z `link: true` i `resolved` na folder stubu
//      + wpis pakietu folderu (`name: three`, wersja stubu).
//   S3 śledzony: trzy pliki stubu na dysku, folder NIE jest ignorowany przez git (KONTROLA: `node_modules/three` JEST).
//   S4 rozwiązywanie: `three` i `three/addons/loaders/GLTFLoader.js` rozwiązują się DO ŚLEDZONEGO folderu (realpath) — kopia
//      w `node_modules/three` jako zwykły katalog (stary sposób) zapala tę asercję; łącze, nie katalog.
//   S5 GRANICA DOWODU zachowana (CLAUDE.md, COLONY_OWNERSHIP_GUARD_PLAN): stub nie eksportuje NICZEGO (w szczególności
//      `TextureLoader`), a jego GLTFLoader rzuca przy load / parse. KONTROLA: prawdziwy three gry (`src/lib/three.module.js`)
//      `TextureLoader` MA — asercja mierzy realną różnicę, nie pustkę.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const STUB_REL = 'src/testing/fixtures/three-stub';
const STUB_DIR = resolve(ROOT, STUB_REL);
const SPEC = 'file:' + STUB_REL;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const header = (t) => console.log('\n' + t);
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const inStub = (absPath) => { try { const r = realpathSync(absPath); return r === STUB_DIR || r.startsWith(STUB_DIR + sep); } catch { return false; } };

header('S1  wskaźnik w package.json');
const pkg = readJson(resolve(ROOT, 'package.json'));
ok(pkg?.devDependencies?.three === SPEC, `S1a devDependencies.three = "${SPEC}" (jest: ${JSON.stringify(pkg?.devDependencies?.three)})`);
ok(!pkg?.dependencies?.three, 'S1b stub NIE jest w dependencies (gra bierze Three.js z importmapy, nie z npm)');

header('S2  lockfile w zgodzie (inaczej `npm ci` odmawia)');
const lock = readJson(resolve(ROOT, 'package-lock.json'));
const linkEntry = lock?.packages?.['node_modules/three'];
ok(linkEntry?.link === true && linkEntry?.resolved === STUB_REL, `S2a lock: node_modules/three → link do ${STUB_REL} (jest: ${JSON.stringify(linkEntry)})`);
const pkgEntry = lock?.packages?.[STUB_REL];
const stubPkg = readJson(resolve(STUB_DIR, 'package.json'));
ok(pkgEntry?.name === 'three' && pkgEntry?.version === stubPkg?.version, `S2b lock: wpis folderu stubu (name three, wersja ${stubPkg?.version})`);
ok(lock?.packages?.['']?.devDependencies?.three === SPEC, 'S2c lock: korzeń zna tę samą zależność co package.json');

header('S3  stub śledzony w git, nie w node_modules');
const files = ['package.json', 'index.js', 'addons/loaders/GLTFLoader.js'];
ok(files.every((f) => existsSync(resolve(STUB_DIR, f))), `S3a pliki stubu na dysku: ${files.join(', ')}`);
const ignored = (rel) => {
  try { execFileSync('git', ['check-ignore', '-q', rel], { cwd: ROOT, stdio: 'ignore' }); return true; }
  catch (e) { return e.status === 1 ? false : null; }   // 1 = nie ignorowany; inny kod / brak git ⇒ null
};
const igStub = ignored(STUB_REL + '/index.js');
const igNm = ignored('node_modules/three/index.js');
ok(igStub === false, `S3b folder stubu NIE jest ignorowany przez git (check-ignore: ${igStub})`);
ok(igNm === true, `S3c KONTROLA: node_modules/three JEST ignorowane (check-ignore: ${igNm}) — stąd dawne znikanie stubu`);

header('S4  `three` rozwiązuje się do śledzonego folderu');
let resolvedMain = null, resolvedAddon = null;
try { resolvedMain = fileURLToPath(import.meta.resolve('three')); } catch (e) { console.log('  ! resolve three: ' + e.message + ' — brak node_modules? uruchom `npm ci`'); }
try { resolvedAddon = fileURLToPath(import.meta.resolve('three/addons/loaders/GLTFLoader.js')); } catch (e) { console.log('  ! resolve addon: ' + e.message); }
ok(!!resolvedMain && inStub(resolvedMain), `S4a three → ${resolvedMain ?? '(nie rozwiązano)'}`);
ok(!!resolvedAddon && inStub(resolvedAddon), `S4b three/addons/loaders/GLTFLoader.js → ${resolvedAddon ?? '(nie rozwiązano)'}`);
let isLink = false;
try { isLink = lstatSync(resolve(ROOT, 'node_modules/three')).isSymbolicLink(); } catch { isLink = false; }
ok(isLink, 'S4c node_modules/three to ŁĄCZE (npm link), nie kopia katalogu');

header('S5  granica dowodu zachowana');
let stub = null, loaderMod = null, real = null;
try { stub = await import('three'); } catch (e) { console.log('  ! import three: ' + e.message); }
try { loaderMod = await import('three/addons/loaders/GLTFLoader.js'); } catch (e) { console.log('  ! import GLTFLoader: ' + e.message); }
try { real = await import('../../lib/three.module.js'); } catch (e) { console.log('  ! import three.module.js: ' + e.message); }
ok(!!stub && Object.keys(stub).length === 0, `S5a stub nie eksportuje niczego (eksporty: ${stub ? Object.keys(stub).length : '—'})`);
ok(!!stub && !('TextureLoader' in stub), 'S5b stub NIE ma TextureLoader (ColonyOverlay / GameScene dalej nie importują się pod node)');
ok(!!real && typeof real.TextureLoader === 'function', 'S5c KONTROLA: prawdziwy three gry TextureLoader MA — S5b mierzy realną różnicę');
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const L = loaderMod?.GLTFLoader ? new loaderMod.GLTFLoader() : null;
ok(!!L && throws(() => L.load()) && throws(() => L.parse()), 'S5d GLTFLoader stubu rzuca przy load / parse (nigdy nie udaje wczytania)');

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
