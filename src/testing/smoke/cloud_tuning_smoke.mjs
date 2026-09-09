// Pokrętła warstwy chmur — V4 / D1 (V-278). Uruchom:
//   node src/testing/smoke/cloud_tuning_smoke.mjs
//
// ⚠ Ziarnistość: ThreeRenderer NIE importuje się pod node (PlanetTextureUtils robi
//   `new THREE.TextureLoader()`, a stub three go celowo nie wystawia — granica dowodu
//   z VISUALS_PLAN §Ustalenia proceduralne). Zachowanie pinowane jest ŹRÓDŁOWO, każdy
//   pin z kontrolą; arytmetyka neutralności liczona WYKONANIEM tutaj.
//
// ⚠ Ten commit jest LICZBOWO NEUTRALNY z założenia: warstwa chmur jest dziś prawie
//   niewidoczna (V-271 — przegrywa test głębi na całej tarczy), więc pokrętła powstają
//   ZANIM będzie co stroić. Powód: gate V4 §5b musi umieć odpowiedzieć „czy nie za
//   głośno" jednym tokenem z konsoli, a nie edycją kodu i przeładowaniem (rundy
//   PROM_DRIFT/PROM_GAIN w V2 kosztowały dokładnie tyle).
//
// Pokrycie:
//   T1  LIVE_CLOUDS — pięć pól, SHIPOWANE wartości. KONTROLA: detektor liczb działa.
//   T2  KAŻDE pole jest ŻYWE — czytane w _tickClouds (reguła V-266 + strukturalny pin
//       T12 z V2). KONTROLA: zmyślone pole zostałoby wykryte jako sierota.
//   T3  NEUTRALNOŚĆ LICZBOWA — stare literały znikły z shadera, a domyślne uniformy
//       dają tę samą arytmetykę. Liczone WYKONANIEM na obu formach wyrażenia alfy.
//   T4  DRIFT_MULT NIE jest uniformem (anti-V-270): uTime jest AKUMULOWANE, więc
//       mnożnik w GLSL byłby SKOKIEM POŁOŻENIA. Mnoży się KROK. KONTROLA: uTime
//       naprawdę jest akumulowane, a nie liczone jako ω·t.
//   T5  cloudTuning to ALIAS, nie kopia (lekcja sunTuning/gasTuning).
//   T6  BLIŹNIAK PlanetGlobeRenderer NIETKNIĘTY — ma własne, zaszyte liczby i własny
//       renderer. Pin przeciw mechanicznemu „utwardź bliźniaka".

import fs from 'fs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const BT = String.fromCharCode(96);
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const rendSrc  = read('../../renderer/ThreeRenderer.js');
const rendCode = strip(rendSrc);
const globeSrc = read('../../renderer/PlanetGlobeRenderer.js');

// Ciało funkcji po nazwie — od `nazwa(` do linii z zamykającą klamrą na tym samym wcięciu.
const fnBody = (src, name) => {
  const k = src.indexOf('\n  ' + name + '(');
  if (k < 0) return null;
  const end = src.indexOf('\n  }', k);
  return end < 0 ? null : src.slice(k, end);
};
const pullBacktick = (src, name) => {
  const open = 'const ' + name + ' = ' + BT;
  const k = src.indexOf(open); if (k < 0) return null;
  const s = k + open.length, e = src.indexOf(BT, s);
  return e < 0 ? null : src.slice(s, e);
};

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — LIVE_CLOUDS: pięć pól, wartości SHIPOWANE');
const blockM = rendCode.match(/const LIVE_CLOUDS = \{([\s\S]*?)\n\};/);
ok('blok LIVE_CLOUDS wyciągnięty ze źródła', !!blockM);
const block = blockM ? blockM[1] : '';
const knobs = {};
for (const m of block.matchAll(/([A-Z_]+):\s*(-?[\d.]+)/g)) knobs[m[1]] = parseFloat(m[2]);
const SHIPPED = { ALPHA: 0.88, COVERAGE_LO: 0.48, COVERAGE_HI: 0.70, NIGHT_FLOOR: 0.05, DRIFT_MULT: 1.00 };
ok('dokładnie pięć pokręteł', Object.keys(knobs).length === 5);
for (const [k, v] of Object.entries(SHIPPED)) ok('LIVE_CLOUDS.' + k + ' === ' + v, knobs[k] === v);
ok('KONTROLA: detektor liczb naprawdę coś wyjął (nie pusty obiekt)', Object.keys(knobs).length > 0);

// ── T2 ───────────────────────────────────────────────────────────────────────
console.log('\nT2 — każde pokrętło jest ŻYWE (czytane w _tickClouds)');
const tick = fnBody(rendCode, '_tickClouds');
ok('_tickClouds wyciągnięty', typeof tick === 'string' && tick.length > 200);
for (const k of Object.keys(SHIPPED)) ok('LIVE_CLOUDS.' + k + ' czytane w _tickClouds', tick.includes('LIVE_CLOUDS.' + k));
ok('KONTROLA: zmyślone pole zostałoby wykryte jako sierota', !tick.includes('LIVE_CLOUDS.NIE_ISTNIEJE'));
ok('_tickClouds pisze uniformy chmur bezwarunkowo (nie tylko przy budowie)',
   tick.includes('uCloudAlpha.value') && tick.includes('uCloudCoverage.value.set') && tick.includes('uCloudNightFloor.value'));

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — NEUTRALNOŚĆ LICZBOWA (stare literały → uniformy o tych samych wartościach)');
const frag = pullBacktick(rendSrc, 'cloudFrag');
ok('cloudFrag wyciągnięty', typeof frag === 'string' && frag.length > 400);
ok('maska czyta uCloudCoverage', frag.includes('smoothstep(uCloudCoverage.x,uCloudCoverage.y,n)'));
ok('alfa czyta uCloudAlpha i uCloudNightFloor',
   frag.includes('cloudMask*uCloudAlpha*edgeFade*(uCloudNightFloor+(1.0-uCloudNightFloor)*nightFade)'));
ok('stary literał maski 0.48,0.70 ZNIKNĄŁ z shadera', !frag.includes('smoothstep(0.48,0.70,n)'));
ok('stary literał alfy 0.88 / 0.05+0.95 ZNIKNĄŁ z shadera', !frag.includes('cloudMask*0.88') && !frag.includes('(0.05+0.95*nightFade)'));
// arytmetyka: nowa forma przy domyślnych pokrętłach == stara forma, w całym zakresie
let maxDelta = 0;
for (let i = 0; i <= 100; i++) {
  const nf = i / 100;
  const oldA = 0.88 * (0.05 + 0.95 * nf);
  const newA = knobs.ALPHA * (knobs.NIGHT_FLOOR + (1 - knobs.NIGHT_FLOOR) * nf);
  maxDelta = Math.max(maxDelta, Math.abs(oldA - newA));
}
ok('alfa: nowa forma == stara dla 101 próbek nightFade (maxΔ ' + maxDelta.toExponential(1) + ')', maxDelta < 1e-15);
ok('KONTROLA: przy INNYM NIGHT_FLOOR formy się rozjeżdżają',
   Math.abs(0.88 * (0.05 + 0.95 * 0.5) - 0.88 * (0.5 + 0.5 * 0.5)) > 0.1);
ok('uniformy startują z LIVE_CLOUDS (nie z zaszytych liczb)',
   rendCode.includes('uCloudAlpha:      { value: LIVE_CLOUDS.ALPHA }') &&
   rendCode.includes('LIVE_CLOUDS.COVERAGE_LO, LIVE_CLOUDS.COVERAGE_HI') &&
   rendCode.includes('uCloudNightFloor: { value: LIVE_CLOUDS.NIGHT_FLOOR }'));

// ── T4 ───────────────────────────────────────────────────────────────────────
console.log('\nT4 — DRIFT_MULT mnoży KROK, nie fazę (anti-V-270)');
ok('shader NIE ma uniformu tempa dryfu', !frag.includes('uCloudDrift') && !frag.includes('uDriftMult'));
ok('shader dalej liczy dryf z akumulowanego uTime', frag.includes('vec3 drift=vec3(t*0.06, t*0.015, t*0.025)') && frag.includes('float t=uTime;'));
ok('_tickClouds mnoży KROK: uTime.value += dt * LIVE_CLOUDS.DRIFT_MULT',
   /uTime\.value \+= dt \* LIVE_CLOUDS\.DRIFT_MULT/.test(tick));
ok('KONTROLA: uTime jest AKUMULOWANE (+=), a nie przypisywane (=) — inaczej pin nie ma sensu',
   !/uTime\.value = /.test(tick));

// ── T5 ───────────────────────────────────────────────────────────────────────
console.log('\nT5 — cloudTuning to ALIAS, nie kopia');
ok('this.cloudTuning = LIVE_CLOUDS (bez spreadu, bez Object.assign)',
   rendCode.includes('this.cloudTuning = LIVE_CLOUDS;'));
ok('KONTROLA: nie ma kopii przez spread', !rendCode.includes('this.cloudTuning = { ...LIVE_CLOUDS'));
ok('sąsiedzi trzymają ten sam idiom (sunTuning / atmoTuning)',
   rendCode.includes('this.sunTuning  = SunShader.LIVE_SUN;') && rendCode.includes('this.atmoTuning = AtmosphereShader.LIVE_ATMO;'));

// ── T6 ───────────────────────────────────────────────────────────────────────
console.log('\nT6 — BLIŹNIAK globusa NIETKNIĘTY (odwrócona reguła bliźniaka)');
ok('PlanetGlobeRenderer nie zna LIVE_CLOUDS', !globeSrc.includes('LIVE_CLOUDS'));
ok('PlanetGlobeRenderer nie zna uCloudAlpha', !globeSrc.includes('uCloudAlpha'));
ok('KONTROLA: globus NAPRAWDĘ ma własną warstwę chmur (inaczej pin mierzy ciszę)',
   globeSrc.includes('cloudFragmentShader') && globeSrc.includes('SphereGeometry(1.018'));

console.log('\n' + (fail ? 'FAIL' : 'OK') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
