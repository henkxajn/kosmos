// Atmosfera po stronie dnia — V3 (A0 rusztowanie + A1 funkcja). Uruchom:
//   node src/testing/smoke/atmosphere_logic_smoke.mjs
//
// ⚠ Ziarnistość jak w całym arcu (VISUALS_PLAN §Ustalenia proceduralne): ThreeRenderer
//   nie importuje się pod node, a GLSL nie jest wykonywalny w sweepie. WYKONANIEM idą
//   T1/T2/T3/T6 (AtmosphereLogic.js i AtmosphereShader.js importują się pod node — ten
//   drugi tylko dlatego, że stub three ma pusty namespace, a materiał powstaje dopiero
//   w wywołaniu fabryki). Reszta to piny ŹRÓDŁOWE, każdy z kontrolą.
//
// ⚠ ASERCJE ODWRÓCONE ŚWIADOMIE WOBEC A0. W A0 ten keeper pinował NIEOBECNOŚĆ pięciu
//   pokręteł (TERM_WIDTH, TWILIGHT_MIX, NIGHT_FLOOR, FADE_PX_*) — reguła V-266: pole
//   przed swoim czytelnikiem to zaślepka. W A1 ich czytelnik istnieje (ATMO_FRAG_LIVE),
//   więc te piny zamieniły się w piny OBECNOŚCI z kontrolami. Zapisane wprost, bo pin,
//   który znika bez śladu, wygląda potem jak zgubiony.
//
// Pokrycie:
//   T0  GLSL ŚCIEŻKI OFF wobec PRZYPIĘTYCH sum SHA-256 sprzed przeniesienia. Mają
//       przechodzić przez CAŁY slice: A1 dopisał wariant OBOK, nie zmienił tych literałów.
//       KONTROLA: mutacja jednego znaku zmienia sumę.
//   T0b Przeniesienie jest PRZENIESIENIEM: tokeny powłoki znikły z ThreeRenderer.js
//       (kod BEZ komentarzy) i są w AtmosphereShader.js, a renderer woła fabrykę.
//       KONTROLA STRIPPERA: token stojący w rendererze WYŁĄCZNIE w komentarzu znika.
//   T0c ATMO_FRAG_LIVE — treść: bramka N·L na ALFIE, wspólny TERM_WIDTH, fresnel
//       per-fragment, USUNIĘTA martwa gałąź koloru nocy. KONTROLA: każdy z tych pinów
//       daje ODWROTNY wynik na literale OFF, więc mierzy różnicę, a nie obecność słowa.
//   T1  densityMul — cztery klasy + fail-open. KONTROLA: wartość pochodzi z knobs.
//   T2  atmoStrengthFor — SHIPOWANE wartości A1 (0.209/0.380/0.513) ORAZ zamrożona
//       migawka OFF (0.55 dla każdej klasy). ANTY-JAŁOWOŚĆ: implementacja ignorująca
//       gęstość rozjeżdża się na pierwszej trójce.
//   T3  LIVE_ATMO — dziewięć pokręteł, każde ŻYWE albo BAKED. ATMO_OFF_KNOBS zamrożone
//       i NIE śledzi LIVE_ATMO (defekt złapany sondą A1). KONTROLE do obu.
//   T4  Wpięcie: tick pisze wszystkie pokrętła, ma guard na materiał OFF, NIE liczy dt,
//       nie stoi w _syncPlanetMeshes; bramka flagi jest U WOŁAJĄCEGO (wzór liveGasShaders).
//   T5  Flaga czytana idiomem „brak klucza = OFF". KONTROLA: detektor !== false działa.
//   T6  discFade — neutralność wbudowana (hi <= lo), rampa, klamry, fail-open na NaN.
//       KONTROLA: przy włączonym paśmie wartości realnie się różnicują.

import fs from 'fs';
import crypto from 'crypto';
import { densityMul, atmoStrengthFor, discFade } from '../../renderer/AtmosphereLogic.js';
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

const pullGlsl = (name) => {
  const open = name + ' = /* glsl */ ' + BT;
  const k = shaderSrc.indexOf(open);
  if (k < 0) return null;
  const start = k + open.length;
  const end = shaderSrc.indexOf(BT, start);
  return end < 0 ? null : shaderSrc.slice(start, end);
};
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const rendererCode = stripComments(rendererSrc);

// ── T0 ───────────────────────────────────────────────────────────────────────
console.log('\nT0 — GLSL ścieżki OFF przeniesiony verbatim (sumy kontrolne)');
// ⚠ Sumy wzięte z GLSL, który stał w ThreeRenderer.addPlanetMesh w commicie e9f12b7 i został
//   przeniesiony bez zmiany ani jednego znaku — z końcami linii CRLF włącznie, CELOWO bez
//   normalizacji: dla dowodu „co widzi przeglądarka" porównuje się dysk z dyskiem.
// ⚠ Te dwie sumy mają przechodzić przez CAŁY slice. A1 dopisał ATMO_FRAG_LIVE OBOK i tych
//   literałów NIE RUSZYŁ — bo kontrakt kill-switcha wymaga, żeby OFF było stanem sprzed
//   slice'u co do bajtu. Jeśli któraś padnie, ktoś ruszył ścieżkę OFF i to jest defekt.
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
ok('KONTROLA STRIPPERA: „SHA-256" stoi w rendererze TYLKO w komentarzu i znika po zdjęciu',
   rendererSrc.includes('SHA-256') && !rendererCode.includes('SHA-256'));
for (const tok of ['vFresnel', 'atmTerminator', 'nightAtmColor', 'dayAtm']) {
  ok('ThreeRenderer (kod) nie zawiera już ' + tok, !rendererCode.includes(tok));
  ok('AtmosphereShader zawiera ' + tok, shaderSrc.includes(tok));
}
ok('promień powłoki bierze się z modułu (ATMO_SCALE), nie z lokalnej stałej',
   rendererCode.includes('AtmosphereShader.ATMO_SCALE') && !rendererCode.includes('const atmoScale'));
ok('powłoka dalej jest znakowana userData.isAtmosphere (czyta to _syncPlanetMeshes)',
   rendererCode.includes('atmoMesh.userData.isAtmosphere = true'));

// ── T0c ──────────────────────────────────────────────────────────────────────
console.log('\nT0c — ATMO_FRAG_LIVE: treść wariantu żywego');
const fragOff  = pullGlsl('ATMO_FRAG');
const fragLive = pullGlsl('ATMO_FRAG_LIVE');
const liveCode = stripComments(fragLive || '');
const offCode  = stripComments(fragOff  || '');
ok('ATMO_FRAG_LIVE istnieje i jest INNYM stringiem niż ATMO_FRAG',
   typeof fragLive === 'string' && fragLive.length > 200 && fragLive !== fragOff);
// Bramka na ALFIE — to jest cała naprawa (D-V3a/D-V3b).
ok('bramka: smoothstep(-uTermWidth, uTermWidth, sunAngle)',
   liveCode.includes('smoothstep(-uTermWidth, uTermWidth, sunAngle)'));
ok('bramka mnoży ALFĘ, nie kolor', /alpha\s*=\s*glow \* uStrength \* dayGate \* uDiscFade/.test(liveCode));
ok('KONTROLA: literał OFF NIE MA bramki (pin mierzy różnicę, nie obecność słowa)',
   !offCode.includes('dayGate'));
// Wspólny TERM_WIDTH dla bramki i ciepłego pasa (D-V3d).
ok('ciepły pas używa TEGO SAMEGO uTermWidth co bramka',
   liveCode.includes('exp(-abs(sunAngle) / uTermWidth)'));
ok('KONTROLA: literał OFF ma tam zaszyte 0.18 (rozjazd, którego pozbywa się A1)',
   offCode.includes('exp(-abs(sunAngle) / 0.18)'));
// Martwa gałąź koloru nocy USUNIĘTA (alfa i tak gasiła te fragmenty do zera).
ok('wariant żywy NIE MA gałęzi koloru nocy', !liveCode.includes('nightAtmColor'));
ok('KONTROLA: literał OFF JĄ MA (pin nie jest ślepy)', offCode.includes('nightAtmColor'));
// Fresnel per-fragment (D-V3q).
ok('fresnel liczony PER-FRAGMENT z vNormal/vViewDir', liveCode.includes('float rim = 1.0 - abs(NdotV)'));
ok('wariant żywy NIE deklaruje varyinga vFresnel', !liveCode.includes('varying float vFresnel'));
ok('KONTROLA: literał OFF czyta vFresnel z vertexa', offCode.includes('float fresnel = vFresnel;'));
ok('ATMO_VERT jest WSPÓLNY — A1 nie dodał ani jednego varyinga',
   (pullGlsl('ATMO_VERT') || '').includes('vFresnel = rim * rim * rim'));
ok('NIGHT_FLOOR wchodzi jako podłoga bramki, nie jako osobny człon',
   liveCode.includes('dayGate = max(dayGate, uNightFloor)'));

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — densityMul (tabela klas, fail-open)');
const LIVE = AtmosphereShader.LIVE_ATMO;
const OFFK = AtmosphereShader.ATMO_OFF_KNOBS;
const K = { STRENGTH: 2.0, DENSITY_THIN: 0.5, DENSITY_BREATHABLE: 1.0, DENSITY_DENSE: 1.5 };
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
console.log('\nT2 — atmoStrengthFor: shipowane wartości A1 i zamrożona migawka OFF');
ok('A1 thin -> 0.209',       near(atmoStrengthFor('thin', LIVE), 0.209, 1e-9));
ok('A1 breathable -> 0.380', near(atmoStrengthFor('breathable', LIVE), 0.380, 1e-9));
ok('A1 dense -> 0.513',      near(atmoStrengthFor('dense', LIVE), 0.513, 1e-9));
ok('A1 nieznana klasa -> 0.380 (fail-open schodzi na samego mistrza)',
   near(atmoStrengthFor('toxic', LIVE), 0.380, 1e-9));
// ⚠ ANTY-JAŁOWOŚĆ: implementacja `return knobs.STRENGTH` (ignorująca gęstość) rozjeżdża
//   się dokładnie tutaj — trzy klasy muszą dać trzy różne liczby.
ok('A1: trzy klasy dają TRZY różne wyniki (mnożnik realnie wchodzi w iloczyn)',
   new Set(['thin', 'breathable', 'dense'].map(c => atmoStrengthFor(c, LIVE))).size === 3);
// ⚠ Ścieżka OFF ma być stanem SPRZED slice'u — 0.55 dla KAŻDEJ klasy, bez mnożników.
for (const cls of ['thin', 'dense', 'breathable', 'toxic', undefined])
  ok('OFF: ' + String(cls) + ' -> 0.55 (bit w bit stan sprzed slice u)',
     atmoStrengthFor(cls, OFFK) === 0.55);

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — LIVE_ATMO: dziewięć pokręteł, każde ŻYWE albo jawnie BAKED');
// ⚠ Wzór T12 z V2, pytanie zadane SZERZEJ: „czy jakikolwiek kod produkcyjny czyta to pole".
//   _tickAtmoMaterials przekazuje CAŁY obiekt do atmoStrengthFor, więc czytelnikiem
//   mnożników jest AtmosphereLogic.js — pin szukający tylko w rendererze byłby ślepy.
const prodSrc = rendererCode + '\n' + stripComments(shaderSrc) + '\n' + stripComments(logicSrc);
const knobs = Object.keys(LIVE);
ok('LIVE_ATMO ma dokładnie 9 pokręteł: ' + knobs.join(', '), knobs.length === 9);
const liveBlock = shaderSrc.slice(shaderSrc.indexOf('const LIVE_ATMO = {'),
                                  shaderSrc.indexOf('};', shaderSrc.indexOf('const LIVE_ATMO = {')));
const isOrphan = (k) => !(new RegExp('\\.' + k + '\\b').test(prodSrc))
                     && !(new RegExp('^\\s*' + k + ':.*//.*BAKED', 'm').test(liveBlock));
const orphans = knobs.filter(isOrphan);
ok('żadne pokrętło nie jest sierotą: ' + (orphans.length ? orphans.join(', ') : 'brak'),
   orphans.length === 0);
ok('KONTROLA: zmyślone pokrętło zostałoby wykryte jako sierota', isOrphan('STRENGTH_NIE_ISTNIEJE'));
// ⚠ ODWRÓCONE WOBEC A0: tam pinowaliśmy NIEOBECNOŚĆ tych pięciu (V-266). Tu mają być,
//   bo mają czytelnika, i mają mieć PODPISANE wartości.
const SIGNED = { STRENGTH: 0.38, TERM_WIDTH: 0.18, TWILIGHT_MIX: 0.35, NIGHT_FLOOR: 0,
                 DENSITY_THIN: 0.55, DENSITY_BREATHABLE: 1.00, DENSITY_DENSE: 1.35,
                 FADE_PX_LO: 0, FADE_PX_HI: 0 };
for (const [k, v] of Object.entries(SIGNED))
  ok('pokrętło ' + k + ' = ' + v + ' (podpisane)', LIVE[k] === v);
ok('FADE_PX są NEUTRALNE domyślnie (hi <= lo), a mimo to żywe',
   discFade(1234, LIVE.FADE_PX_LO, LIVE.FADE_PX_HI) === 1.0);
// ⚠ Defekt złapany SONDĄ A1: fabryka OFF liczyła siłę z LIVE_ATMO, więc po zmianie mistrza
//   stan OFF dawał 0.209 zamiast 0.55 — trzeci stan zamiast rollbacku.
ok('ATMO_OFF_KNOBS jest ZAMROŻONE (konsola go nie przestawi)', Object.isFrozen(OFFK));
ok('ATMO_OFF_KNOBS NIE ŚLEDZI LIVE_ATMO (mistrz 0.55 vs 0.38)',
   OFFK.STRENGTH === 0.55 && LIVE.STRENGTH === 0.38 && OFFK !== LIVE);
ok('ATMO_OFF_KNOBS ma mnożniki neutralne (stan sprzed slice u nie znał gęstości)',
   OFFK.DENSITY_THIN === 1 && OFFK.DENSITY_BREATHABLE === 1 && OFFK.DENSITY_DENSE === 1);
ok('fabryka OFF czyta ZAMROŻONĄ migawkę, nie pokrętła',
   /createAtmosphereMaterial[\s\S]{0,600}atmoStrengthFor\(planet\.atmosphere, ATMO_OFF_KNOBS\)/.test(shaderSrc));
ok('fabryka ŻYWA czyta LIVE_ATMO',
   /createLiveAtmosphereMaterial[\s\S]{0,900}atmoStrengthFor\(planet\.atmosphere, LIVE_ATMO\)/.test(shaderSrc));
ok('ATMO_SCALE nie jest pokrętłem (D-V3c wariant W3 odrzucony)',
   AtmosphereShader.ATMO_SCALE === 1.08 && !('ATMO_SCALE' in LIVE));

// ── T4 ───────────────────────────────────────────────────────────────────────
console.log('\nT4 — wpięcie: pętla renderowania, flaga u wołającego, ZERO dt');
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
for (const u of ['uTermWidth', 'uTwilightMix', 'uNightFloor', 'uDiscFade'])
  ok('tick pisze ' + u + ' co klatkę', !!atmoBody && atmoBody.includes('u.' + u + '.value'));
ok('tick liczy uDiscFade przez discFade(px, LO, HI)',
   !!atmoBody && atmoBody.includes('discFade(px, T.FADE_PX_LO, T.FADE_PX_HI)'));
// ⚠ Guard nie jest ozdobą: flagę da się przełączyć w konsoli PO zbudowaniu materiałów.
ok('tick ma guard na materiał ścieżki OFF (trzy uniformy zamiast siedmiu)',
   !!atmoBody && atmoBody.includes('if (!u.uTermWidth) continue;'));
// ⚠ Bramka flagi stoi U WOŁAJĄCEGO — wzór liveGasShaders; moduł shadera nie importuje GameConfig.
// ⚠ ROZLUŹNIONE W V4/D2 (2026-09-09) i to jest zamierzone. Pin wymagał DOSŁOWNIE
//   `createAtmosphereMaterial(planet)` — jednoargumentowo — więc padł, gdy fabryki
//   dostały drugi parametr `logDepth` (V-267). INWARIANT, którego pilnuje, jest ten sam
//   i dalej prawdziwy: wybór fabryki robi RENDERER na fladze, a nie moduł shadera.
//   Zapisane, bo pin, który cicho łagodnieje, przestaje być pinem.
ok('bramka flagi jest w addPlanetMesh (wybór fabryki), nie w module shadera',
   /GAME_CONFIG\.FEATURES\.dayNightAtmosphere[\s\S]{0,160}createLiveAtmosphereMaterial\(planet[^)]*\)[\s\S]{0,160}createAtmosphereMaterial\(planet[^)]*\)/.test(rendererCode));
ok('KONTROLA: pin dalej DYSKRYMINUJE — nie przechodzi bez nazwy flagi',
   !/GAME_CONFIG\.FEATURES\.liveSunShader[\s\S]{0,160}createLiveAtmosphereMaterial\(planet[^)]*\)/.test(rendererCode));
ok('AtmosphereShader.js NIE importuje GameConfig (a przez niego i18n)',
   !shaderSrc.includes("from '../config/GameConfig.js'"));
// ⚠ Pułapka D-V3j: _syncPlanetMeshes biegnie z physics:updated, czyli STOI PRZY PAUZIE.
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
ok('renderer NIE czyta jej idiomem !== false (to byłby brak-klucza-ON)', !notFalseIdiom(rendererCode));
ok('KONTROLA: detektor formy !== false działa (sprawdzony na napisie syntetycznym)',
   notFalseIdiom('FEATURES.dayNightAtmosphere !== false'));
ok('przyrząd odróżnia „nie zmierzono" od „zmierzono" (discPx null przy fladze OFF)',
   rendererCode.includes('getAtmoInfo()') &&
   rendererCode.includes('flag ? (child.userData.atmoDiscPx ?? null) : null'));
ok('przyrząd raportuje, czy powłoka jest ŻYWA (gate musi to odróżnić od stanu OFF)',
   rendererCode.includes('zywy:      !!child.material?.uniforms?.uTermWidth'));

// ── T6 ───────────────────────────────────────────────────────────────────────
console.log('\nT6 — discFade: neutralność wbudowana, rampa, klamry');
ok('NEUTRALNE przy hi == lo (shipowane 0/0)', discFade(0, 0, 0) === 1.0);
ok('NEUTRALNE przy hi < lo (odwrócone pasmo nie gasi powłoki)', discFade(50, 100, 20) === 1.0);
ok('px <= lo -> 0 (mała tarcza gaśnie całkiem)', discFade(40, 40, 140) === 0);
ok('px >= hi -> 1 (duża tarcza świeci pełnią)', discFade(140, 40, 140) === 1);
ok('środek pasma -> 0.5 (hermite jest symetryczny)', near(discFade(90, 40, 140), 0.5, 1e-12));
ok('kształt = GLSL smoothstep, nie liniowy (t=0.8 -> 0.896, nie 0.8)',
   near(discFade(120, 40, 140), 0.896, 1e-9));
ok('klamra od dołu: px daleko poniżej lo dalej 0', discFade(-500, 40, 140) === 0);
ok('klamra od góry: px daleko powyżej hi dalej 1', discFade(1e6, 40, 140) === 1);
ok('FAIL-OPEN: NaN z pomiaru kamery nie gasi powłoki', discFade(NaN, 40, 140) === 1.0);
ok('KONTROLA: przy włączonym paśmie wartości REALNIE się różnicują',
   new Set([50, 70, 90, 110, 130].map(p => discFade(p, 40, 140))).size === 5);
ok('KONTROLA: monotoniczna niemalejąca', discFade(60, 40, 140) < discFade(100, 40, 140));

// ── wynik ────────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
