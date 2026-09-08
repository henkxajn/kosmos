// Atmosfera po stronie dnia — V3 / commit A0 (rusztowanie). Uruchom:
//   node src/testing/smoke/atmosphere_logic_smoke.mjs
//
// A0 NIE ZMIENIA ANI JEDNEGO PIKSELA i to jest jego jedyna obietnica. Ten keeper
// sprawdza dokładnie tę obietnicę oraz to, że rusztowanie NIE JEST zaślepką.
//
// ⚠ Ziarnistość jest ta sama, co w całym arcu (VISUALS_PLAN §Ustalenia proceduralne):
//   ThreeRenderer nie importuje się pod node, a GLSL nie jest wykonywalny w sweepie.
//   WYKONANIEM idą T1/T2/T3 (AtmosphereLogic.js i AtmosphereShader.js importują się pod
//   node — ten drugi tylko dlatego, że stub three ma pusty namespace, a materiał powstaje
//   dopiero w wywołaniu fabryki). Reszta to piny ŹRÓDŁOWE, każdy z kontrolą.
//
// Pokrycie:
//   T0  GLSL: ATMO_VERT i ATMO_FRAG wobec PRZYPIĘTYCH sum SHA-256 sprzed przeniesienia.
//       KONTROLA: mutacja jednego znaku zmienia sumę (pin realnie dyskryminuje).
//   T0b Przeniesienie jest PRZENIESIENIEM: tokeny powłoki znikły z ThreeRenderer.js
//       (kod BEZ komentarzy) i są w AtmosphereShader.js, a renderer woła fabrykę.
//       KONTROLA STRIPPERA: token stojący w rendererze WYŁĄCZNIE w komentarzu znika.
//   T1  densityMul — cztery klasy + fail-open. KONTROLA: wartość pochodzi z knobs.
//   T2  atmoStrengthFor — A0 neutralny LICZBOWO. ANTY-JAŁOWOŚĆ: przy podpisanych
//       wartościach A1 klasy się rozjeżdżają (bez tej połowy implementacja ignorująca
//       gęstość przechodziłaby cały T2).
//   T3  LIVE_ATMO — komplet pokręteł czytany WYKONANIEM; każde ŻYWE albo BAKED.
//       KONTROLA: zmyślone pokrętło byłoby sierotą. Plus pin V-266: pól A1 NIE MA w A0.
//   T4  Wpięcie: _tickAtmoMaterials istnieje, wołane w pętli renderowania, bramkowane
//       flagą, NIE liczy dt (dekret C1b) i NIE stoi w _syncPlanetMeshes (pułapka D-V3j).
//       KONTROLA: _tickClouds dt LICZY — pin odróżnia obie funkcje.
//   T5  Flaga czytana idiomem „brak klucza = OFF". KONTROLA: detektor formy !== false
//       działa (sprawdzony na napisie syntetycznym), więc pin nie jest ślepy.

import fs from 'fs';
import crypto from 'crypto';
import { densityMul, atmoStrengthFor } from '../../renderer/AtmosphereLogic.js';
import { AtmosphereShader } from '../../renderer/AtmosphereShader.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const BT = String.fromCharCode(96);
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

const shaderSrc   = read('../../renderer/AtmosphereShader.js');
const rendererSrc = read('../../renderer/ThreeRenderer.js');
const logicSrc    = read('../../renderer/AtmosphereLogic.js');
const configSrc   = read('../../config/GameConfig.js');

// ── T0 ───────────────────────────────────────────────────────────────────────
console.log('\nT0 — GLSL przeniesiony verbatim (sumy kontrolne)');
const pullGlsl = (name) => {
  const open = name + ' = /* glsl */ ' + BT;
  const k = shaderSrc.indexOf(open);
  if (k < 0) return null;
  const start = k + open.length;
  const end = shaderSrc.indexOf(BT, start);
  return end < 0 ? null : shaderSrc.slice(start, end);
};
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);
// ⚠ Sumy wzięte z GLSL, który stał w ThreeRenderer.addPlanetMesh w commicie e9f12b7 i został
//   przeniesiony bez zmiany ani jednego znaku — z końcami linii CRLF włącznie, CELOWO bez
//   normalizacji: dla dowodu „co widzi przeglądarka" porównuje się dysk z dyskiem
//   (VISUALS_PLAN §Ustalenia proceduralne).
// ⚠ Te dwie sumy mają przechodzić przez CAŁY slice. A1 dopisze ATMO_FRAG_LIVE OBOK, a nie
//   zmieni tych literałów — bo kontrakt kill-switcha wymaga, żeby OFF było stanem sprzed
//   slice'u co do bajtu. Jeśli któraś padnie, ktoś ruszył ścieżkę OFF i to jest wtedy
//   defekt, a nie planowana zmiana.
const GOLDEN = {
  ATMO_VERT: { len: 724,  sha: 'ebd45ef871ce3b13' },
  ATMO_FRAG: { len: 1465, sha: 'c7e1481ae9c07468' },
};
for (const [name, g] of Object.entries(GOLDEN)) {
  const src = pullGlsl(name);
  ok(name + ': wyciągnięty ze źródła', typeof src === 'string' && src.length > 40);
  ok(name + ': długość ' + (src ? src.length : '?') + ' == ' + g.len, !!src && src.length === g.len);
  ok(name + ': sha256/16 == ' + g.sha, !!src && sha(src) === g.sha);
}
ok('KONTROLA: mutacja jednej cyfry zmienia sumę (pin dyskryminuje)',
   sha(pullGlsl('ATMO_FRAG').replace('0.18', '0.19')) !== GOLDEN.ATMO_FRAG.sha);

// ── T0b ──────────────────────────────────────────────────────────────────────
console.log('\nT0b — to jest PRZENIESIENIE, nie kopia obok starego kodu');
// ⚠ Pin negatywny czyta KOD, nie komentarze (lekcja z keepera gwiazdy, T9).
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const rendererCode = stripComments(rendererSrc);
ok('KONTROLA STRIPPERA: „SHA-256" stoi w rendererze TYLKO w komentarzu i znika po zdjęciu',
   rendererSrc.includes('SHA-256') && !rendererCode.includes('SHA-256'));
for (const tok of ['vFresnel', 'atmTerminator', 'nightAtmColor', 'dayAtmColor']) {
  ok('ThreeRenderer (kod) nie zawiera już ' + tok, !rendererCode.includes(tok));
  ok('AtmosphereShader zawiera ' + tok, shaderSrc.includes(tok));
}
ok('ThreeRenderer woła fabrykę AtmosphereShader.createAtmosphereMaterial',
   rendererCode.includes('AtmosphereShader.createAtmosphereMaterial(planet)'));
ok('promień powłoki bierze się z modułu (ATMO_SCALE), nie z lokalnej stałej',
   rendererCode.includes('AtmosphereShader.ATMO_SCALE') && !rendererCode.includes('const atmoScale'));
ok('powłoka dalej jest znakowana userData.isAtmosphere (czyta to _syncPlanetMeshes)',
   rendererCode.includes('atmoMesh.userData.isAtmosphere = true'));

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — densityMul (tabela klas, fail-open)');
const A0 = AtmosphereShader.LIVE_ATMO;
const K  = { STRENGTH: 2.0, DENSITY_THIN: 0.5, DENSITY_BREATHABLE: 1.0, DENSITY_DENSE: 1.5 };
ok('thin -> DENSITY_THIN',             densityMul('thin', K) === 0.5);
ok('dense -> DENSITY_DENSE',           densityMul('dense', K) === 1.5);
ok('breathable -> DENSITY_BREATHABLE', densityMul('breathable', K) === 1.0);
ok('FAIL-OPEN: toxic -> 1.0',          densityMul('toxic', K) === 1.0);
ok('FAIL-OPEN: undefined -> 1.0',      densityMul(undefined, K) === 1.0);
ok('FAIL-OPEN: none -> 1.0 (powłoki i tak nie ma, ale funkcja nie zgaduje zera)',
   densityMul('none', K) === 1.0);
ok('KONTROLA: wartość pochodzi z knobs, nie z tabeli zaszytej w funkcji',
   densityMul('thin', { ...K, DENSITY_THIN: 0.11 }) === 0.11);

// ── T2 ───────────────────────────────────────────────────────────────────────
console.log('\nT2 — atmoStrengthFor: A0 neutralny, A1 rozdziela klasy');
// A0: mistrz 0.55 (dzisiejsze atmoStrength) × mnożniki 1.0 => 0.55 dla KAŻDEJ klasy.
for (const cls of ['thin', 'dense', 'breathable', 'toxic', undefined]) {
  ok('A0: ' + String(cls) + ' -> 0.55 (bit w bit dzisiejsza wartość)',
     atmoStrengthFor(cls, A0) === 0.55);
}
// ⚠ ANTY-JAŁOWOŚĆ: bez tej połowy implementacja `return knobs.STRENGTH` (ignorująca
//   gęstość) przeszłaby cały blok wyżej — bo w A0 wszystkie mnożniki są równe 1.
const A1 = { STRENGTH: 0.38, DENSITY_THIN: 0.55, DENSITY_BREATHABLE: 1.00, DENSITY_DENSE: 1.35 };
ok('A1: thin -> 0.209',       near(atmoStrengthFor('thin', A1), 0.209, 1e-9));
ok('A1: breathable -> 0.380', near(atmoStrengthFor('breathable', A1), 0.380, 1e-9));
ok('A1: dense -> 0.513',      near(atmoStrengthFor('dense', A1), 0.513, 1e-9));
ok('A1: nieznana klasa -> 0.380 (fail-open schodzi na samego mistrza)',
   near(atmoStrengthFor('toxic', A1), 0.380, 1e-9));
ok('A1: trzy klasy dają TRZY różne wyniki (mnożnik realnie wchodzi w iloczyn)',
   new Set(['thin', 'breathable', 'dense'].map(c => atmoStrengthFor(c, A1))).size === 3);

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — LIVE_ATMO: każde pokrętło ŻYWE albo jawnie BAKED');
// ⚠ Wzór T12 z V2, ale pytanie zadane SZERZEJ: „czy jakikolwiek kod produkcyjny czyta to
//   pole". _tickAtmoMaterials przekazuje CAŁY obiekt do atmoStrengthFor, więc czytelnikiem
//   mnożników jest AtmosphereLogic.js — pin szukający tylko w rendererze uznałby wszystkie
//   cztery za sieroty i byłby ślepy na prawdziwe podpięcie.
const prodSrc = rendererCode + '\n' + stripComments(shaderSrc) + '\n' + stripComments(logicSrc);
const knobs = Object.keys(A0);
ok('LIVE_ATMO ma dokładnie 4 pokrętła (A0), nie komplet z podpisu: ' + knobs.join(', '),
   knobs.length === 4);
const liveBlock = shaderSrc.slice(shaderSrc.indexOf('const LIVE_ATMO = {'),
                                  shaderSrc.indexOf('};', shaderSrc.indexOf('const LIVE_ATMO = {')));
const isOrphan = (k) => !(new RegExp('\\.' + k + '\\b').test(prodSrc))
                     && !(new RegExp('^\\s*' + k + ':.*//.*BAKED', 'm').test(liveBlock));
const orphans = knobs.filter(isOrphan);
ok('żadne pokrętło nie jest sierotą: ' + (orphans.length ? orphans.join(', ') : 'brak'),
   orphans.length === 0);
ok('KONTROLA: zmyślone pokrętło zostałoby wykryte jako sierota', isOrphan('STRENGTH_NIE_ISTNIEJE'));
// ⚠ Pin V-266: pole zadeklarowane przed swoim czytelnikiem to zaślepka nazwana jak funkcja.
//   Te pięć JEST PODPISANYCH (D-V3a/d/e/f), ale ich konsumentem jest shader z A1 — więc
//   w A0 nie wolno im tu być. W A1 ta asercja ma paść i to jest zamierzone.
for (const k of ['TERM_WIDTH', 'TWILIGHT_MIX', 'NIGHT_FLOOR', 'FADE_PX_LO', 'FADE_PX_HI'])
  ok('A0 nie deklaruje ' + k + ' (przyjdzie w A1 razem ze swoim czytelnikiem)', !(k in A0));
ok('ATMO_SCALE nie jest pokrętłem (D-V3c wariant W3 odrzucony)',
   AtmosphereShader.ATMO_SCALE === 1.08 && !('ATMO_SCALE' in A0));

// ── T4 ───────────────────────────────────────────────────────────────────────
console.log('\nT4 — wpięcie ticka: pętla renderowania, flaga, ZERO dt');
const fnBody = (name) => {
  const k = rendererCode.indexOf('\n  ' + name + '(');
  if (k < 0) return null;
  const e = rendererCode.indexOf('\n  }', k);
  return e < 0 ? null : rendererCode.slice(k, e);
};
const atmoBody = fnBody('_tickAtmoMaterials');
ok('_tickAtmoMaterials istnieje', !!atmoBody && atmoBody.length > 200);
ok('KONTROLA fnBody: ciało zawiera nazwę uniformu, który pisze (ekstraktor nie zwraca śmieci)',
   !!atmoBody && atmoBody.includes('uStrength'));
ok('bramkowane flagą, idiom brak-klucza-OFF',
   !!atmoBody && atmoBody.includes('if (!GAME_CONFIG.FEATURES.dayNightAtmosphere) return;'));
ok('NIE liczy dt — dekret C1b (krok czasu ma JEDNO miejsce: _tickClouds)',
   !!atmoBody && !atmoBody.includes('animDeltaSeconds') && !atmoBody.includes('performance.now'));
ok('KONTROLA: _tickClouds dt LICZY (pin odróżnia obie funkcje, a nie świeci jałowo)',
   (fnBody('_tickClouds') || '').includes('animDeltaSeconds'));
ok('wołane w pętli renderowania, obok _tickSunMaterials',
   /_tickSunMaterials\(\);[\s\S]{0,200}this\._tickAtmoMaterials\(\);/.test(rendererCode));
// ⚠ Pułapka D-V3j: _syncPlanetMeshes biegnie z physics:updated, czyli STOI PRZY PAUZIE.
//   Pokrętło pchane stamtąd byłoby dla gate'u martwe (awaria PROM_DRIFT z re-gate'u S4).
const syncBody = fnBody('_syncPlanetMeshes');
ok('KONTROLA fnBody: ciało _syncPlanetMeshes to naprawdę ono (pisze uLightDir)',
   !!syncBody && syncBody.includes('uLightDir'));
ok('_tickAtmoMaterials NIE jest wołane z _syncPlanetMeshes (pułapka D-V3j)',
   !!syncBody && !syncBody.includes('_tickAtmoMaterials'));
ok('zapis uLightDir ZOSTAJE w _syncPlanetMeshes i POZA flagą (jest sprzed slice u)',
   !!syncBody && syncBody.includes('isAtmosphere') && !syncBody.includes('dayNightAtmosphere'));

// ── T5 ───────────────────────────────────────────────────────────────────────
console.log('\nT5 — flaga dayNightAtmosphere: idiom „brak klucza = OFF"');
ok('obecna w FEATURES i domyślnie true', /dayNightAtmosphere:\s*true,/.test(configSrc));
const notFalseIdiom = (s) => /dayNightAtmosphere\s*!==\s*false/.test(s);
ok('renderer NIE czyta jej idiomem !== false (to byłby brak-klucza-ON)',
   !notFalseIdiom(rendererCode));
ok('KONTROLA: detektor formy !== false działa (sprawdzony na napisie syntetycznym)',
   notFalseIdiom('FEATURES.dayNightAtmosphere !== false'));
ok('przyrząd odróżnia „nie zmierzono" od „zmierzono" (discPx null przy fladze OFF)',
   rendererCode.includes('getAtmoInfo()') &&
   rendererCode.includes('flag ? (child.userData.atmoDiscPx ?? null) : null'));

// ── wynik ────────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
