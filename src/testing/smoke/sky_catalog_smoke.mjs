// NIEBO — katalog nieba z galaktyki (ARC GALAXY, docs/design/GALAXY_PLAN.md §4; D-GX-4/5/6, F7). Uruchom:
//   node src/testing/smoke/sky_catalog_smoke.mjs
//
// Keeper LOGIKI (protokół F8 / HUD_PLAN §4.0 aneks): bez pinów na stałych rysunku (kalibracja jasności to pokrętła
// strojone okiem na bramce), bez mutacji rysunku, bez kontroli na poprzednim commicie. `SkyCatalog.js` i
// `StarPointShader.js` nie mają importów three / DOM, więc część wykonaniowa biegnie pod node wprost; renderer
// (`ThreeRenderer` nie importuje się pod node) — piny źródłowe na wpięciu i złota suma ścieżki OFF.
//
// Pokrycie:
//   T1  determinizm — to samo ziarno ⇒ te same bajty katalogu i nieba; inne ziarno ⇒ inne niebo; `skySeedOf`.
//   T2  niezależność strumienia — strumień nieba ≠ strumień GalaxyGenerator (mulberry32(seed)); rozgrzewka
//       zużyta (nigdy pierwszy rzut); sól unikalna w repo; katalog nie mutuje `galaxyData.systems`.
//   T3  liczności — FILLER_COUNT tła + 72 prawdziwe; z każdego układu FILLER_COUNT + 71 (aktywny pominięty); układ
//       spoza katalogu. (FILLER_COUNT = 14 000 — wybór właściciela na bramce NIEBO; rama F7: ~7 000.)
//   T4  kierunki — długość 1; kierunek prawdziwej gwiazdy = znormalizowany odcinek (osie świata X=gx, Y=gz, Z=gy).
//   T5  paralaksa między dwoma układami — dokładny kąt dla prawdziwej gwiazdy, mały dla tła (odniesienie: 0,43°).
//   T6  prawo magnitudo — skończone, w [I_MIN, CAP], monotoniczne; miękki sufit nigdy nie przekracza CAP.
//   T7  brak galaktyki ⇒ niebo puste (nie losowe): katalog `null`, zero punktów, kopuła bez Math.random.
//   T8  flaga OFF ⇒ `_buildBackground` = kod kotwicy e4e5717 (złota suma po normalizacji) + literały PSF co do znaku.
//   T9  wpięcie — idiom flagi, wywołanie w GameScene po zmintowaniu / wczytaniu, przeliczenie w switchSystem po
//       initSystem, kopuła za kamerą po update kontrolera i przed composerem.
//   T10 pokrętła — alias `skyTuning`, każde pole ma czytelnika, zmiana pokrętła zmienia niebo, FILLER_COUNT = ogon.
//   T11 StarPointShader — derywacja `uRealFade` (wstawki, reszta co do znaku), fabryka kopuły (lista nieprzezroczysta,
//       bez testu i zapisu głębi, addytywnie, bez chunków V4).
//   T12 Finding 597 — martwa konfiguracja nieba wycofana.
//   T13 prawdziwe układy — własny sufit REAL_CAP, wzmocnienie po suficie tła (korekta 1).
//   T14 każde pokrętło działa od razu; domyślne 14 000 / 0,3 / 4,5 (PASS właściciela, korekta 2).
//   T15 przyrządy bramki — skyLookHome / skyLookAt / skyMarks (wymuszenie etykiet nieba bez CTRL; korekta 2).
//   Etykiety nieba przy CTRL (reguła widoczności, mgła wojny, role, skupiska) — keeper `sky_labels_smoke`.

import '../headless/env.js';
import fs from 'node:fs';
import crypto from 'node:crypto';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const norm = (s) => strip(s).replace(/\s+/g, ' ').trim();
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);
const BT = String.fromCharCode(96);
/** Ciało metody klasy (wcięcie 2) — od `{` do linii `  }`. */
const methodBody = (src, sig) => {
  const h = '\n  ' + sig + ' {\n'; const i = src.indexOf(h); if (i < 0) return null;
  const s = i + h.length; const e = src.indexOf('\n  }\n', s); return e < 0 ? null : src.slice(s, e + 1);
};
const deg = (rad) => rad * 180 / Math.PI;
const angle = (ax, ay, az, bx, by, bz) => {
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
  const c = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb)));
  return Math.acos(c);
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const SC = await import('../../utils/SkyCatalog.js');
const SPS = await import('../../renderer/StarPointShader.js');
const { GalaxyGenerator } = await import('../../generators/GalaxyGenerator.js');

const SEED_A = 123456789, SEED_B = -1781800850;
const galA = GalaxyGenerator.generate(SEED_A, 'Sol', 'G');
const galB = GalaxyGenerator.generate(SEED_B, 'Sol', 'G');
const far = (gal) => gal.systems.reduce((a, s) => (Math.hypot(s.x, s.y, s.z) > Math.hypot(a.x, a.y, a.z) ? s : a));

// Kopia algorytmu GalaxyGenerator (mulberry32 z SUROWEGO ziarna) — do porównania strumieni (T2).
function mulberry32(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── T1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT1 — determinizm: to samo ziarno ⇒ te same bajty; inne ziarno ⇒ inne niebo');
const c1 = SC.buildSkyCatalog(galA.systems, SC.skySeedOf(galA));
const c2 = SC.buildSkyCatalog(galA.systems, SC.skySeedOf(galA));
const cB = SC.buildSkyCatalog(galB.systems, SC.skySeedOf(galB));
const sameArr = (x, y) => x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
ok('katalog: pos / lum / cls / phase bajt w bajt przy tym samym ziarnie',
   sameArr(c1.pos, c2.pos) && sameArr(c1.lum, c2.lum) && sameArr(c1.cls, c2.cls) && sameArr(c1.phase, c2.phase));
const o1 = SC.allocSkyBuffers(c1.N), o2 = SC.allocSkyBuffers(c2.N);
SC.skyFrom(c1, 'sys_home', o1); SC.skyFrom(c2, 'sys_home', o2);
ok('niebo z domu: dir / pos / color / intensity / size bajt w bajt',
   sameArr(o1.dir, o2.dir) && sameArr(o1.pos, o2.pos) && sameArr(o1.color, o2.color) && sameArr(o1.intensity, o2.intensity) && sameArr(o1.size, o2.size));
let diffFill = 0;
for (let i = c1.realCount; i < c1.N; i++) if (c1.pos[i * 3] !== cB.pos[i * 3]) diffFill++;
ok(`inne ziarno ⇒ inne tło (${diffFill} / ${c1.fillerCount} gwiazd tła na innym miejscu)`, diffFill > 0.99 * c1.fillerCount);
ok('skySeedOf: pole `seed` (int32) wprost', SC.skySeedOf(galA) === (galA.seed | 0) && SC.skySeedOf({ seed: 2 ** 33 + 5, systems: [] }) === ((2 ** 33 + 5) | 0));
const legacy = { systems: galA.systems.map((s) => ({ ...s })) };
const legacyMoved = { systems: galA.systems.map((s, i) => ({ ...s, x: i === 3 ? s.x + 0.5 : s.x })) };
ok('skySeedOf: zapis bez pola `seed` — ziarno z treści galaktyki, stałe dla pliku, inne dla innej treści',
   SC.skySeedOf(legacy) === SC.skySeedOf({ systems: galA.systems.map((s) => ({ ...s })) }) && SC.skySeedOf(legacy) !== SC.skySeedOf(legacyMoved));

// ── T2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT2 — strumień nieba niezależny od strumienia galaktyki');
const sky = SC.makeSkyRng(SEED_A), gal = mulberry32(SEED_A);
const sv = Array.from({ length: 256 }, () => sky()), gv = Array.from({ length: 256 }, () => gal());
const corr = (() => { const ma = sv.reduce((a, b) => a + b) / 256, mb = gv.reduce((a, b) => a + b) / 256;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < 256; i++) { sab += (sv[i] - ma) * (gv[i] - mb); saa += (sv[i] - ma) ** 2; sbb += (gv[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb); })();
ok('żaden z 256 pierwszych rzutów nieba nie równa się rzutowi strumienia GalaxyGenerator', sv.every((v, i) => v !== gv[i]));
ok(`korelacja rzutów nieba z rzutami galaktyki ~0 (r = ${corr.toFixed(3)})`, Math.abs(corr) < 0.2);
ok('ziarno strumienia nieba ≠ surowe ziarno galaktyki', SC.skyStreamSeed(SEED_A) !== (SEED_A >>> 0) && SC.skyStreamSeed(SEED_A) !== (SEED_A | 0));
const raw = mulberry32(SC.skyStreamSeed(SEED_A)); const skipped = [raw(), raw(), raw()];
ok(`rozgrzewka zużyta (${SC.SKY_WARMUP} rzuty): pierwszy rzut nieba = rzut nr ${SC.SKY_WARMUP + 1} strumienia, nie pierwszy`,
   SC.makeSkyRng(SEED_A)() === raw() && skipped.length === SC.SKY_WARMUP && SC.makeSkyRng(SEED_A)() !== mulberry32(SC.skyStreamSeed(SEED_A))());
const near1 = SC.makeSkyRng(1000)(), near2 = SC.makeSkyRng(1001)();
ok(`sąsiednie ziarna (1000, 1001) dają rozrzucone pierwsze rzuty (Δ = ${Math.abs(near1 - near2).toFixed(3)})`, Math.abs(near1 - near2) > 1e-3);
let saltElsewhere = 0;
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = dir + '/' + e.name;
  if (e.isDirectory()) { if (e.name !== 'testing' && e.name !== 'lib') walk(p); } else if (e.name.endsWith('.js') && !p.endsWith('utils/SkyCatalog.js')) {
    if (fs.readFileSync(p, 'utf8').toUpperCase().includes('0X5C7CA7')) saltElsewhere++; } } };
walk(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, ''));
ok('sól nieba unikalna (zero innych plików w src/ z 0x5C7CA7; ≠ sole EmpireGenerator 0x0B1EC7 / 0x7A17C5)',
   saltElsewhere === 0 && SC.SKY_SALT !== 0x0B1EC7 && SC.SKY_SALT !== 0x7A17C5);
const before = JSON.stringify(galA.systems);
SC.buildSkyCatalog(galA.systems, SEED_A);
ok('budowa katalogu nie mutuje `galaxyData.systems`', JSON.stringify(galA.systems) === before);

// ── T3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const F0 = SC.LIVE_SKY.FILLER_COUNT;
console.log(`\nT3 — liczności: ${F0} + 71, aktywny układ pominięty`);
ok(`katalog: ${c1.realCount} prawdziwych + ${c1.fillerCount} tła = ${c1.N}`, c1.realCount === 72 && c1.fillerCount === F0 && c1.N === F0 + 72);
const farA = far(galA), nearA = galA.systems.filter((s) => s.id !== 'sys_home').reduce((a, s) => (Math.hypot(s.x, s.y, s.z) < Math.hypot(a.x, a.y, a.z) ? s : a));
for (const sid of ['sys_home', nearA.id, farA.id]) {
  const o = SC.allocSkyBuffers(c1.N); const r = SC.skyFrom(c1, sid, o);
  let real = 0, filler = 0, self = 0;
  for (let k = 0; k < o.count; k++) { if (o.real[k] === 1) real++; else filler++; if (o.src[k] === c1.index.get(sid)) self++; }
  ok(`z ${sid}: ${o.count} punktów = ${filler} tła + ${real} prawdziwych, aktywnego brak (${self})`,
     r.observerFound && o.count === F0 + 71 && filler === F0 && real === 71 && self === 0);
}
{ const o = SC.allocSkyBuffers(c1.N); const r = SC.skyFrom(c1, 'sys_nieznany', o);
  ok(`układ spoza katalogu: obserwator w początku galaktyki (dom), nic nie pominięte jawnie — dom odpada geometrycznie, d = 0 (count ${o.count})`,
     !r.observerFound && r.excluded === -1 && o.count === F0 + 71); }

// ── T4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT4 — kierunki: długość 1 i znak (osie świata X = gx, Y = gz, Z = gy)');
{ const o = SC.allocSkyBuffers(c1.N); SC.skyFrom(c1, nearA.id, o);
  let worst = 0; for (let k = 0; k < o.count; k++) worst = Math.max(worst, Math.abs(Math.hypot(o.dir[k * 3], o.dir[k * 3 + 1], o.dir[k * 3 + 2]) - 1));
  ok(`|dir| = 1 dla wszystkich ${o.count} punktów (najgorzej ${worst.toExponential(1)})`, worst < 1e-6);
  const obs = nearA; let checked = 0, bad = 0;
  for (let k = 0; k < o.count; k++) {
    if (o.real[k] !== 1) continue;
    const s = galA.systems[o.src[k]];
    const dx = s.x - obs.x, dy = s.y - obs.y, dz = (s.z || 0) - (obs.z || 0), d = Math.hypot(dx, dy, dz);
    const ex = dx / d, ey = dz / d, ez = dy / d;
    if (Math.abs(o.dir[k * 3] - ex) > 1e-6 || Math.abs(o.dir[k * 3 + 1] - ey) > 1e-6 || Math.abs(o.dir[k * 3 + 2] - ez) > 1e-6) bad++;
    checked++;
  }
  ok(`kierunek każdej z ${checked} prawdziwych gwiazd = znormalizowany odcinek do niej, w osiach świata (błędnych: ${bad})`, checked === 71 && bad === 0);
  const k0 = [...Array(o.count).keys()].find((k) => o.real[k] === 1 && Math.abs(galA.systems[o.src[k]].x - obs.x) > 1 && Math.abs(galA.systems[o.src[k]].y - obs.y) > 1 && Math.abs((galA.systems[o.src[k]].z || 0) - (obs.z || 0)) > 0.5);
  const s0 = galA.systems[o.src[k0]];
  ok('znak: dir.x ~ gx, dir.y ~ gz (wysokość), dir.z ~ gy',
     Math.sign(o.dir[k0 * 3]) === Math.sign(s0.x - obs.x) && Math.sign(o.dir[k0 * 3 + 1]) === Math.sign((s0.z || 0) - (obs.z || 0)) && Math.sign(o.dir[k0 * 3 + 2]) === Math.sign(s0.y - obs.y));
  let rangeOk = true; for (let k = 0; k < o.count; k++) { const r = Math.hypot(o.pos[k * 3], o.pos[k * 3 + 1], o.pos[k * 3 + 2]); if (r < SC.SKY_DOME_WU.MIN - 1e-3 || r > SC.SKY_DOME_WU.MAX + 1e-3) rangeOk = false; }
  ok(`położenie na kopule w paśmie ${SC.SKY_DOME_WU.MIN}–${SC.SKY_DOME_WU.MAX} j. (pasmo dawnej powłoki)`, rangeOk);
}

// ── T5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT5 — paralaksa między dwoma układami: dokładna dla prawdziwej gwiazdy, mała dla tła');
{ const oH = SC.allocSkyBuffers(c1.N), oF = SC.allocSkyBuffers(c1.N);
  SC.skyFrom(c1, 'sys_home', oH); SC.skyFrom(c1, farA.id, oF);
  const dirOf = (o) => { const m = new Map(); for (let k = 0; k < o.count; k++) m.set(o.src[k], k); return m; };
  const mH = dirOf(oH), mF = dirOf(oF);
  let worst = 0, n = 0; const realPar = [];
  for (let i = 0; i < c1.realCount; i++) {
    if (!mH.has(i) || !mF.has(i)) continue;
    const s = galA.systems[i];
    const exact = angle(s.x - 0, s.y - 0, (s.z || 0) - 0, s.x - farA.x, s.y - farA.y, (s.z || 0) - (farA.z || 0));
    const a = mH.get(i) * 3, b = mF.get(i) * 3;
    const got = angle(oH.dir[a], oH.dir[a + 1], oH.dir[a + 2], oF.dir[b], oF.dir[b + 1], oF.dir[b + 2]);
    worst = Math.max(worst, Math.abs(got - exact)); realPar.push(deg(exact)); n++;
  }
  ok(`prawdziwe gwiazdy (${n}): kąt paralaksy z nieba = kąt geometryczny (najgorzej ${worst.toExponential(1)} rad)`, n === 70 && worst < 1e-4);
  const fillPar = [];
  for (let i = c1.realCount; i < c1.N; i++) { const a = mH.get(i) * 3, b = mF.get(i) * 3;
    fillPar.push(deg(angle(oH.dir[a], oH.dir[a + 1], oH.dir[a + 2], oF.dir[b], oF.dir[b + 1], oF.dir[b + 2]))); }
  const mf = median(fillPar), mr = median(realPar);
  ok(`tło: mediana paralaksy dom ↔ ${farA.id} (${Math.hypot(farA.x, farA.y, farA.z).toFixed(1)} ly) = ${mf.toFixed(3)}° — odniesienie fazy A 0,43°`, mf > 0.2 && mf < 0.9);
  ok(`prawdziwe gwiazdy niosą paralaksę: mediana ${mr.toFixed(1)}° ≫ tło ${mf.toFixed(2)}°`, mr > 10 * mf);
}

// ── T6 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT6 — prawo magnitudo: skończone, w granicach, monotoniczne');
{ const K = SC.LIVE_SKY;
  const fluxes = [0, -1, NaN, Infinity, 1e-40, 1e-30, 1e-12, 1e-9, 1e-6, 1e-4, 1e-2, 1, 1e3, 1e30];
  const Is = fluxes.map((f) => SC.intensityFromMag(SC.magnitudeOf(f), K));
  ok('intensywność skończona i w [I_MIN, CAP] dla strumieni skrajnych (0, −1, NaN, ∞, 1e−40 … 1e30)', Is.every((I) => Number.isFinite(I) && I >= K.I_MIN && I <= K.CAP));
  const grid = Array.from({ length: 400 }, (_, i) => 10 ** (-12 + i * 0.04));
  const Ig = grid.map((f) => SC.intensityFromMag(SC.magnitudeOf(f), K));
  ok('monotonicznie niemalejąca w strumieniu (400 próbek, 1e−12 … 1e4)', Ig.every((v, i) => i === 0 || v >= Ig[i - 1] - 1e-12));
  ok('miękki sufit: nawet strumień 1e30 daje < CAP + 1e−9 (asymptota, nie przepalenie)', SC.intensityFromMag(SC.magnitudeOf(1e30), K) <= K.CAP + 1e-9);
  const sz = Ig.map((I) => SC.sizeFromIntensity(I, K));
  ok('rozmiar w [SIZE_MIN, SIZE_MIN + SIZE_GAIN], monotoniczny', sz.every((s, i) => s >= K.SIZE_MIN - 1e-9 && s <= K.SIZE_MIN + K.SIZE_GAIN + 1e-9 && (i === 0 || s >= sz[i - 1] - 1e-12)));
  for (const k2 of [{ ...K, KNEE: 5, CAP: 2 }, { ...K, SLOPE: -0.3 }, { ...K, CAP: K.I_MIN }]) {
    const v = grid.map((f) => SC.intensityFromMag(SC.magnitudeOf(f), k2));
    ok(`pokrętła skrajne (KNEE ${k2.KNEE} CAP ${k2.CAP} SLOPE ${k2.SLOPE}): dalej skończone i ≤ CAP`, v.every((I) => Number.isFinite(I) && I <= Math.max(k2.CAP, k2.I_MIN)));
  }
  // PRZECELOWANE 2026-10-30 (NIEBO korekta 2): przy domyślnym REAL_BOOST_MAG = 0,3 prawdziwe układy świecą ponad sufitem
  // tła (do własnego REAL_CAP) — granica zależy od klasy gwiazdy (było: wszystkie ≤ CAP, gdy domyślne wzmocnienie = 0).
  const o = SC.allocSkyBuffers(c1.N); SC.skyFrom(c1, 'sys_home', o);
  let bad = 0, realAbove = 0;
  for (let k = 0; k < o.count; k++) {
    const cap = o.real[k] === 1 ? K.REAL_CAP : K.CAP;
    if (!Number.isFinite(o.intensity[k]) || !Number.isFinite(o.size[k]) || o.intensity[k] > cap + 1e-9 || o.intensity[k] < K.I_MIN) bad++;
    if (o.real[k] === 1 && o.intensity[k] > K.CAP) realAbove++;
  }
  ok(`niebo z domu: wszystkie ${o.count} intensywności i rozmiary skończone, tło ≤ CAP, prawdziwe ≤ REAL_CAP (złych: ${bad}; prawdziwych ponad CAP: ${realAbove})`, bad === 0);
}

// ── T7 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT7 — brak galaktyki ⇒ niebo puste, nie losowe');
ok('buildSkyCatalog(null / [] / bez poprawnych układów) ⇒ null', SC.buildSkyCatalog(null, 1) === null && SC.buildSkyCatalog([], 1) === null && SC.buildSkyCatalog([{ id: 'x' }], 1) === null);
{ const o = SC.allocSkyBuffers(10); o.count = 5; const r = SC.skyFrom(null, 'sys_home', o);
  ok('skyFrom(null) ⇒ zero punktów (także w buforze)', r.count === 0 && o.count === 0); }
const skySrc = read('../../utils/SkyCatalog.js'), skyCode = strip(skySrc);
ok('SkyCatalog.js: bez Math.random, bez window / document, jedyny import = SeedMath',
   !skyCode.includes('Math.random') && !/\bwindow\b|\bdocument\b/.test(skyCode) && (skySrc.match(/^import /gm) || []).length === 1 && /^import \{[^}]*\} from '\.\/SeedMath\.js';$/m.test(skySrc));
const trSrc = read('../../renderer/ThreeRenderer.js'), trCode = strip(trSrc);
const dome = methodBody(trSrc, '_buildSkyDome()') ?? '';
ok('kopuła (_buildSkyDome): bez Math.random, bez katalogu, punkty niewidoczne do setSkyGalaxy',
   dome.length > 0 && !strip(dome).includes('Math.random') && !strip(dome).includes('buildSkyCatalog') && !strip(dome).includes('skyFrom') && strip(dome).includes('points.visible       = false'));
const rec = methodBody(trSrc, "_recomputeSky(reason = 'recompute')") ?? '';
ok('_recomputeSky bez katalogu ⇒ punkty niewidoczne (niebo puste, nie stare)', /if \(!cat\) \{\s*points\.visible = false;/.test(strip(rec)));

// ── T8 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT8 — flaga OFF ⇒ `_buildBackground` = kod kotwicy e4e5717 co do znaku (po normalizacji)');
const GOLD_OFF = '934bbfdeba070e93';            // _buildBackground kotwicy, literały → STAR_VERT / STAR_FRAG, bez komentarzy
const GOLD_VERT = '1786d5e76b1eca0a', GOLD_FRAG = '9c36b1b87fe10f68';   // treść literałów PSF w kotwicy (LF)
ok(`STAR_VERT co do znaku jak w kotwicy (sha ${sha(SPS.STAR_VERT)})`, sha(SPS.STAR_VERT) === GOLD_VERT);
ok(`STAR_FRAG co do znaku jak w kotwicy (sha ${sha(SPS.STAR_FRAG)})`, sha(SPS.STAR_FRAG) === GOLD_FRAG);
ok('KONTROLA: zmiana jednego znaku literału zmienia sumę', sha(SPS.STAR_VERT.replace('38.0', '39.0')) !== GOLD_VERT || sha(SPS.STAR_FRAG.replace('38.0', '39.0')) !== GOLD_FRAG);
const bg = methodBody(trSrc, '_buildBackground()'), neb = methodBody(trSrc, '_buildNebula()');
ok('pierwsza instrukcja _buildBackground = gałąź ON (`if (skyCatalogOn()) { this._buildSkyDome(); return; }`)',
   !!bg && strip(bg).trim().startsWith('if (skyCatalogOn()) { this._buildSkyDome(); return; }'));
const offEquiv = bg && neb ? bg.replace('if (skyCatalogOn()) { this._buildSkyDome(); return; }', '')
  .replace('this.scene.add(this._buildNebula());', neb.replace('return nebula;', 'this.scene.add(nebula);')) : '';
ok(`ścieżka OFF (bez gałęzi ON, mgławica z powrotem w miejscu wywołania) = kotwica (sha ${sha(norm(offEquiv))})`, sha(norm(offEquiv)) === GOLD_OFF);
ok('KONTROLA: inna liczba gwiazd w ścieżce OFF zmienia sumę', sha(norm(offEquiv.replace('const N   = 7000;', 'const N   = 7001;'))) !== GOLD_OFF);
ok('ścieżka OFF używa literałów ze StarPointShader.js (import), nie własnej kopii',
   /import \{ STAR_VERT, STAR_FRAG, createSkyStarMaterial \} from '\.\/StarPointShader\.js';/.test(trSrc) && !trCode.includes('const starVert = ' + BT));

// ── T9 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT9 — wpięcie: flaga, GameScene, switchSystem, kopuła za kamerą');
ok('flaga czytana FUNKCJĄ, idiom „brak klucza = OFF"', trCode.includes('const skyCatalogOn = () => !!GAME_CONFIG.FEATURES?.skyCatalog;'));
const cfgSrc = read('../../config/GameConfig.js');
ok('flaga istnieje w GameConfig i jest ON (krok do obejrzenia)', /skyCatalog:\s*true,/.test(strip(cfgSrc)));
const gsCode = strip(read('../../scenes/GameScene.js'));
const call = 'this.threeRenderer?.setSkyGalaxy?.(window.KOSMOS.galaxyData);';
const iCall = gsCode.indexOf(call), iMint = gsCode.indexOf('window.KOSMOS.galaxyData = GalaxyGenerator.generate('),
      iLoad = gsCode.indexOf('window.KOSMOS.galaxyData = savedData.civ4x.galaxyData;'), iEmp = gsCode.indexOf('EmpireGenerator.generate(window.KOSMOS.galaxyData');
ok('GameScene: setSkyGalaxy dokładnie RAZ, po obu gałęziach (mint i wczytanie), przed imperiami',
   gsCode.split(call).length === 2 && iMint > 0 && iLoad > iMint && iCall > iLoad && iEmp > iCall);
ok('setSkyGalaxy: przy fladze OFF (brak kopuły) no-op', /setSkyGalaxy\(galaxyData\) \{\s*if \(!this\._sky\) return null;/.test(trCode));
const sw = strip(methodBody(trSrc, 'switchSystem(star, planets, planetesimals, moons = [])') ?? '');
ok('switchSystem: przeliczenie nieba PO initSystem (nowy układ = nowe niebo)', sw.indexOf('this.initSystem(') >= 0 && sw.indexOf("this._recomputeSky('switchSystem')") > sw.indexOf('this.initSystem('));
ok('switchSystem: układ obserwatora z gwiazdy nowego układu (`star.systemId`)', sw.includes('this._skySystemId = star?.systemId'));
const loop = strip(methodBody(trSrc, '_startLoop()') ?? '');
const iUpd = loop.indexOf('this._cameraController.update()'), iSky = loop.indexOf('this._sky.group.position.copy(this.camera.position)'), iComp = loop.indexOf('this._composer.render()');
ok('pętla: kopuła za kamerą PO update kontrolera, PRZED composerem; bramka `this._sky` (OFF — brak)',
   iUpd > 0 && iSky > iUpd && iComp > iSky && loop.includes('if (this._sky) { this._sky.group.position.copy(this.camera.position); this._tickSky(); }'));

// ── T10 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT10 — pokrętła żywe');
ok('skyTuning = ALIAS LIVE_SKY (nie kopia)', trCode.includes('this.skyTuning = LIVE_SKY;'));
const code = skyCode.slice(skyCode.indexOf('export const LIVE_SKY'));
const declEnd = code.indexOf('};');
const after = code.slice(declEnd);
const keys = Object.keys(SC.LIVE_SKY);
const readers = keys.filter((k) => new RegExp('\\b(k|knobs)\\.' + k + '\\b|LIVE_SKY\\.' + k + '\\b').test(after) || trCode.includes('LIVE_SKY.' + k));
ok(`każde pokrętło ma czytelnika (${readers.length} / ${keys.length}: ${keys.filter((k) => !readers.includes(k)).join(', ') || 'komplet'})`, readers.length === keys.length);
{ const base = SC.allocSkyBuffers(c1.N), alt = SC.allocSkyBuffers(c1.N);
  SC.skyFrom(c1, 'sys_home', base, SC.LIVE_SKY);
  SC.skyFrom(c1, 'sys_home', alt, { ...SC.LIVE_SKY, REAL_BOOST_MAG: 2 });
  let realUp = 0, fillSame = 0, nReal = 0, nFill = 0;
  for (let k = 0; k < base.count; k++) { if (base.real[k] === 1) { nReal++; if (alt.intensity[k] > base.intensity[k]) realUp++; } else { nFill++; if (alt.intensity[k] === base.intensity[k]) fillSame++; } }
  ok(`REAL_BOOST_MAG ${SC.LIVE_SKY.REAL_BOOST_MAG} → 2: jaśnieją prawdziwe (${realUp} / ${nReal}), tło bez zmian (${fillSame} / ${nFill})`, realUp === nReal && fillSame === nFill);
  const alt2 = SC.allocSkyBuffers(c1.N); SC.skyFrom(c1, 'sys_home', alt2, { ...SC.LIVE_SKY, SLOPE: SC.LIVE_SKY.SLOPE + 0.1 });
  ok('SLOPE +0,1: intensywność się zmienia (pokrętło działa)', alt2.intensity.some((v, k) => k < alt2.count && v !== base.intensity[k]));
}
{ const c7k = SC.buildSkyCatalog(galA.systems, SC.skySeedOf(galA), { fillerCount: 7000 });
  const c8k = SC.buildSkyCatalog(galA.systems, SC.skySeedOf(galA), { fillerCount: 8000 });
  let same = true; for (let i = 0; i < c7k.N * 3 && same; i++) if (c8k.pos[i] !== c7k.pos[i]) same = false;
  ok('FILLER_COUNT 7 000 → 8 000: pierwsze 7 072 gwiazdy na miejscu, rośnie tylko ogon (kontrakt rzutów)', same && c8k.N === 8072); }
{ const snap = SC.skyKnobSnapshot(SC.LIVE_SKY);
  ok('skyKnobsChanged: bez zmiany ⇒ nic', !SC.skyKnobsChanged(snap, SC.LIVE_SKY).changed);
  const ch1 = SC.skyKnobsChanged(snap, { ...SC.LIVE_SKY, CAP: 2.2 }), ch2 = SC.skyKnobsChanged(snap, { ...SC.LIVE_SKY, FILLER_COUNT: 9000 });
  ok('skyKnobsChanged: CAP ⇒ przeliczenie bez przebudowy; FILLER_COUNT ⇒ przebudowa katalogu', ch1.changed && !ch1.rebuild && ch2.changed && ch2.rebuild);
  ok('skyKnobsChanged(null) ⇒ pierwsze przeliczenie (przed galaktyką kończy się pustym niebem)', SC.skyKnobsChanged(null, SC.LIVE_SKY).rebuild); }
ok('_tickSky w pętli porównuje pokrętła i przelicza tylko przy zmianie',
   /_tickSky\(\) \{\s*const ch = skyKnobsChanged\(this\._skyKnobSnap, LIVE_SKY\);\s*if \(!ch\.changed\) return;/.test(trCode));

// ── T11 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT11 — StarPointShader: derywacja uRealFade i fabryka kopuły');
const spsSrc = read('../../renderer/StarPointShader.js'), spsCode = strip(spsSrc);
ok('StarPointShader.js bez importów (wykonywalny pod node, THREE wstrzykiwany)', !/^import /m.test(spsSrc));
const SKYV = SPS.STAR_VERT_SKY;
ok('wariant kopuły ma aReal, uRealFade i mnożenie vI — każde DOKŁADNIE raz',
   SKYV.split(SPS.REAL_FADE_DECL_ATTR).length === 2 && SKYV.split(SPS.REAL_FADE_DECL_UNIFORM).length === 2 && SKYV.split(SPS.REAL_FADE_APPLY).length === 2);
ok('wariant kopuły bez trzech wstawek = STAR_VERT co do znaku (reszta nietknięta)',
   SKYV.replace(SPS.REAL_FADE_DECL_ATTR, '').replace(SPS.REAL_FADE_DECL_UNIFORM, '').replace(SPS.REAL_FADE_APPLY, '') === SPS.STAR_VERT);
ok('mnożenie vI PO przypisaniu oddechu, PRZED gl_PointSize', SKYV.indexOf(SPS.REAL_FADE_APPLY) > SKYV.indexOf('vI = aIntensity') && SKYV.indexOf(SPS.REAL_FADE_APPLY) < SKYV.indexOf('gl_PointSize'));
const throwsX = (fn) => { try { fn(); return false; } catch (e) { return true; } };
ok('derywacja rzuca: podwójna, brak kotwicy, nie-string', throwsX(() => SPS.deriveRealFadeVert(SKYV)) && throwsX(() => SPS.deriveRealFadeVert('void main(){}')) && throwsX(() => SPS.deriveRealFadeVert(null)));
const FakeTHREE = { AdditiveBlending: 2, ShaderMaterial: class { constructor(p) { Object.assign(this, p); } } };
const m = SPS.createSkyStarMaterial(FakeTHREE, { pixelRatio: 1.5 });
ok('fabryka kopuły: lista NIEPRZEZROCZYSTA, bez testu i zapisu głębi, addytywnie, kolory wierzchołków (D-D3 — jak mgławica)',
   m.transparent === false && m.depthTest === false && m.depthWrite === false && m.blending === FakeTHREE.AdditiveBlending && m.vertexColors === true);
ok('fabryka kopuły: uRealFade = 1,0 w NIEBO, uPx = pixelRatio, shadery = wariant kopuły bez chunków V4',
   m.uniforms.uRealFade.value === 1 && m.uniforms.uPx.value === 1.5 && m.vertexShader === SKYV && m.fragmentShader === SPS.STAR_FRAG
   && !/logdepth/i.test(m.vertexShader + m.fragmentShader));

// ── T12 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT12 — Finding 597: martwa konfiguracja nieba wycofana');
ok('GameConfig: brak BACKGROUND_COLOR i STAR_COUNT_BACKGROUND', !/BACKGROUND_COLOR\s*:|STAR_COUNT_BACKGROUND\s*:/.test(strip(cfgSrc)));
const themeSrc = read('../../config/ThemeConfig.js');
ok('ThemeConfig: brak tokenu `starfield` (motyw bazowy i presety)', !/\bstarfield\s*:/.test(strip(themeSrc)));
ok('KONTROLA: sąsiedni token `vignetteEnd` dalej w ThemeConfig (czytany właściwy plik)', /\bvignetteEnd\s*:/.test(strip(themeSrc)));

// ── T13 (korekta 1) ──────────────────────────────────────────────────────────────────────────────────────────────
// Wzmocnienie prawdziwych układów działało PRZED wspólnym miękkim sufitem tła i ginęło pod nim (z Kochab boost 0 → 2:
// najjaśniejsza prawdziwa 2,562 → 2,579 — zmierzone w grze). Teraz: prawo tła bez zmian, boost PO jego suficie,
// prawdziwe mają WŁASNY sufit REAL_CAP (i zapas rozmiaru REAL_SIZE_GAIN).
console.log('\nT13 — prawdziwe układy: własny sufit, wzmocnienie po suficie tła (korekta 1)');
{ const K = SC.LIVE_SKY;
  const mags = Array.from({ length: 300 }, (_, i) => -5 + i * 0.1);
  ok('boost 0: jasność prawdziwej gwiazdy = prawo tła co do bitu (obraz sprzed korekty)',
     mags.every((m) => SC.realIntensityFromMag(m, { ...K, REAL_BOOST_MAG: 0 }) === SC.intensityFromMag(m, K)));
  ok('boost 0: rozmiar prawdziwej gwiazdy = rozmiar tła co do bitu',
     mags.every((m) => { const I = SC.intensityFromMag(m, K); return SC.realSizeFromIntensity(I, K) === SC.sizeFromIntensity(I, K); }));
  const boosts = [-1, 0, 0.5, 1, 1.5, 2, 3];
  const mono = mags.every((m) => boosts.every((b, j) => j === 0 || SC.realIntensityFromMag(m, { ...K, REAL_BOOST_MAG: b }) >= SC.realIntensityFromMag(m, { ...K, REAL_BOOST_MAG: boosts[j - 1] }) - 1e-12));
  ok('monotoniczna w boost (−1 … 3) dla 300 magnitudo', mono);
  ok('nigdy powyżej REAL_CAP (także boost 10) i nigdy poniżej I_MIN', mags.every((m) => { const v = SC.realIntensityFromMag(m, { ...K, REAL_BOOST_MAG: 10 }); return v <= K.REAL_CAP + 1e-12 && v >= K.I_MIN; }));
  const mBright = SC.magnitudeOf(1e-2);   // prawdziwy sąsiad pod sufitem tła
  const i0 = SC.realIntensityFromMag(mBright, { ...K, REAL_BOOST_MAG: 0 }), i1 = SC.realIntensityFromMag(mBright, { ...K, REAL_BOOST_MAG: 1 }), i2 = SC.realIntensityFromMag(mBright, { ...K, REAL_BOOST_MAG: 2 });
  ok(`sąsiad przy suficie tła ROŚNIE z boost: ${i0.toFixed(2)} → ${i1.toFixed(2)} → ${i2.toFixed(2)} (wcześniej ginęło pod 2,6)`, i0 <= K.CAP && i1 > K.CAP && i2 > i1);
  const s0 = SC.realSizeFromIntensity(i0, K), s2 = SC.realSizeFromIntensity(i2, K);
  ok(`rozmiar rośnie ponad dawne maksimum (${s0.toFixed(2)} → ${s2.toFixed(2)} px), ≤ SIZE_MIN + SIZE_GAIN + REAL_SIZE_GAIN`,
     s2 > s0 && s2 <= K.SIZE_MIN + K.SIZE_GAIN + K.REAL_SIZE_GAIN + 1e-9);
  const outs = [0, 1, 2].map((b) => { const o = SC.allocSkyBuffers(c1.N); const r = SC.skyFrom(c1, nearA.id, o, { ...K, REAL_BOOST_MAG: b }); return { o, r }; });
  let fillerSame = true;
  for (let k = 0; k < outs[0].o.count; k++) if (outs[0].o.real[k] === 0 && (outs[1].o.intensity[k] !== outs[0].o.intensity[k] || outs[2].o.intensity[k] !== outs[0].o.intensity[k])) fillerSame = false;
  ok('tło NIE zmienia się od REAL_BOOST_MAG (prawo tła nietknięte)', fillerSame && outs[0].r.maxFillerI === outs[2].r.maxFillerI);
  const above = outs.map((x) => x.r.realsAboveMaxFiller), maxR = outs.map((x) => x.r.maxRealI);
  ok(`prawdziwe ponad najjaśniejszym tłem: ${above.join(' / ')} przy boost 0 / 1 / 2 (niemalejąco)`, above[0] <= above[1] && above[1] <= above[2] && above[2] > above[0]);
  ok(`maxRealI ${maxR.map((v) => v.toFixed(2)).join(' / ')} wobec maxFillerI ${outs[0].r.maxFillerI.toFixed(2)} — boost widoczny ponad sufitem tła`, maxR[1] > K.CAP && maxR[2] > maxR[1]);
  const c2 = { ...K, REAL_BOOST_MAG: 1, REAL_CAP: 6 };
  ok('REAL_CAP jest pokrętłem: wyższy sufit ⇒ jaśniejsze prawdziwe przy tym samym boost', SC.realIntensityFromMag(mBright, c2) > SC.realIntensityFromMag(mBright, { ...K, REAL_BOOST_MAG: 1 }));
}

// ── T14 (korekta 1) ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nT14 — każde pokrętło skyTuning działa od razu (przebudowa wyłącznie dla FILLER_COUNT)');
{ const snap = SC.skyKnobSnapshot(SC.LIVE_SKY);
  const bad = [];
  for (const key of Object.keys(SC.LIVE_SKY)) {
    const ch = SC.skyKnobsChanged(snap, { ...SC.LIVE_SKY, [key]: SC.LIVE_SKY[key] + 1 });
    if (!ch.changed || ch.rebuild !== (key === 'FILLER_COUNT')) bad.push(key);
  }
  ok(`zmiana KAŻDEGO z ${Object.keys(SC.LIVE_SKY).length} pokręteł wykryta; przebudowa katalogu tylko przy FILLER_COUNT (złe: ${bad.join(', ') || 'brak'})`, bad.length === 0);
  ok('pokrętła korekty 1 (REAL_CAP, REAL_SIZE_GAIN) są w skyTuning', 'REAL_CAP' in SC.LIVE_SKY && 'REAL_SIZE_GAIN' in SC.LIVE_SKY);
  // PRZECELOWANE 2026-10-30 (NIEBO korekta 2): domyślne wartości pokręteł po PASS właściciela — 14 000 / 0,3 / 4,5
  // (było: REAL_BOOST_MAG = 0, obraz korekty 1).
  ok('domyślne FILLER_COUNT = 14 000, REAL_BOOST_MAG = 0,3, REAL_CAP = 4,5 (PASS właściciela na bramce, korekta 2)',
     SC.LIVE_SKY.FILLER_COUNT === 14000 && SC.LIVE_SKY.REAL_BOOST_MAG === 0.3 && SC.LIVE_SKY.REAL_CAP === 4.5);
}

// ── T15 (korekta 1; przecelowane w korekcie 2) ───────────────────────────────────────────────────────────────────
console.log('\nT15 — przyrządy bramki: skyLookHome / skyLookAt / skyMarks (debug)');
{ const list = SC.nearestRealSystems(c1, nearA.id);
  ok(`najbliższe prawdziwe z ${nearA.id}: ${list.length} układów, rosnąco, bez obserwatora; 1. = ${list[0]?.id} (${list[0]?.distLy.toFixed(2)} ly)`,
     list.length === 71 && list.every((e, i) => i === 0 || e.distLy >= list[i - 1].distLy) && !list.some((e) => e.id === nearA.id));
  const fromHome = SC.nearestRealSystems(c1, 'sys_home');
  ok('z domu najbliższy = układ najbliższy domu w galaxyData', fromHome[0].id === nearA.id);
  const dirH = SC.skyDirectionTo(c1, nearA.id, c1.index.get('sys_home'));
  const exp = { x: 0 - nearA.x, y: 0 - (nearA.z || 0), z: 0 - nearA.y }, el = Math.hypot(exp.x, exp.y, exp.z);
  ok('skyDirectionTo (sąsiad → dom) = znormalizowany odcinek w osiach świata', Math.abs(dirH.x - exp.x / el) < 1e-12 && Math.abs(dirH.y - exp.y / el) < 1e-12 && Math.abs(dirH.z - exp.z / el) < 1e-12);
  // Kamera kontrolera: pozycja = cel + d·(sinφ cosθ, cosφ, sinφ sinθ), patrzy na cel, „góra" = +Y.
  const check = (u, off) => {
    const a = SC.lookAnglesFor(u, off);
    const s = { x: Math.sin(a.phi) * Math.cos(a.theta), y: Math.cos(a.phi), z: Math.sin(a.phi) * Math.sin(a.theta) };
    const v = { x: -s.x, y: -s.y, z: -s.z };
    const rgt = { x: -v.z, y: 0, z: v.x }; const rl = Math.hypot(rgt.x, rgt.z); rgt.x /= rl; rgt.z /= rl;   // v × Y
    const up = { x: rgt.y * v.z - rgt.z * v.y, y: rgt.z * v.x - rgt.x * v.z, z: rgt.x * v.y - rgt.y * v.x };
    const ul = Math.hypot(u.x, u.y, u.z), uu = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
    return { a, side: uu.x * rgt.x + uu.z * rgt.z, upDot: uu.x * up.x + uu.y * up.y + uu.z * up.z, ang: Math.acos(Math.max(-1, Math.min(1, uu.x * v.x + uu.y * v.y + uu.z * v.z))) };
  };
  let worst = 0, n = 0;
  for (const u of [{ x: 1, y: 0.1, z: 0 }, { x: -0.3, y: -0.4, z: 0.8 }, { x: 0.2, y: 0.5, z: -0.7 }, dirH]) {
    const r = check(u, SC.SKY_LOOK.OFFSET_RAD);
    if (r.a.clamped) continue;
    worst = Math.max(worst, Math.abs(r.side), Math.abs(r.ang - SC.SKY_LOOK.OFFSET_RAD)); n++;
    if (!(r.upDot > 0)) worst = 9;
  }
  ok(`lookAnglesFor: kierunek dokładnie ${SC.SKY_LOOK.OFFSET_RAD} rad NAD środkiem kadru, bez odchyłki w bok (${n} kierunków, najgorzej ${worst.toExponential(1)})`, n >= 3 && worst < 1e-9);
  const z = SC.lookAnglesFor({ x: 0, y: 1, z: 0.001 });
  ok('kierunek przy zenicie: φ przycięte do granic kontrolera, flaga `clamped`', z.clamped && z.phi >= SC.SKY_LOOK.PHI_MIN && z.phi <= SC.SKY_LOOK.PHI_MAX);
  // PRZECELOWANE 2026-10-30 (NIEBO korekta 2): znaczniki z własnego płótna debug (`SkyMarksDebug`, `skyMarkLabel`) zastąpiła
  // podwarstwa HUD etykiet nieba przy CTRL (`HudSkyLabelLayer`, keeper `sky_labels_smoke`); `skyMarks(1)` tylko ją wymusza.
  ok('linie konsoli przyrządów: odległość „x,x ly” (formatLy); dawny pomocnik etykiety znacznika usunięty',
     SC.formatLy(3.947) === '3,9 ly' && SC.formatLy(12.04) === '12,0 ly' && !('skyMarkLabel' in SC));
  const gsCode2 = strip(read('../../scenes/GameScene.js'));
  ok('KOSMOS.debug: skyLookHome / skyLookAt / skyMarks delegują do renderera',
     gsCode2.includes('skyLookHome: () => window.KOSMOS?.threeRenderer?.skyLookHome?.()') && gsCode2.includes('skyLookAt:   (n) => window.KOSMOS?.threeRenderer?.skyLookAt?.(n)') && gsCode2.includes('skyMarks:    (on) => window.KOSMOS?.threeRenderer?.setSkyMarks?.(on)'));
  const marksCode = strip(methodBody(trSrc, 'setSkyMarks(on)') ?? '');
  ok('skyMarks: wymuszenie domyślnie WYŁĄCZONE (`_skyLabelsForced = false` w konstruktorze), `setSkyMarks` ustawia flagę i budzi warstwę HUD',
     trCode.includes('this._skyLabelsForced = false;') && marksCode.includes('this._skyLabelsForced = !!on;') && marksCode.includes('hudLayer?.wake?.()'));
  ok('renderer nie ma już własnego płótna znaczników: brak importu, brak rysunku w pętli, plik `SkyMarksDebug.js` usunięty',
     !trCode.includes('SkyMarksDebug') && !trCode.includes('_skyMarks') && !loop.includes('_skyMarks') && !fs.existsSync(new URL('../../renderer/SkyMarksDebug.js', import.meta.url)));
  ok('KONTROLA: pętla renderu czytana (composer w ciele `_startLoop`)', loop.includes('this._composer.render()'));
  const lookCode = strip(methodBody(trSrc, '_skyLookAtIndex(index, label)') ?? '');
  ok('skyLook*: zmienia WYŁĄCZNIE θ / φ (dystans i cel kamery nietknięte)',
     lookCode.includes('cc._theta = a.theta; cc._phi = a.phi;') && !/_dist\b|_targetDist|_goalTarget|_target\b|snapDist|focusOn/.test(lookCode));
  ok('skyLook*: nazwa w linii konsoli z jednego punktu składania mgły wojny (`systemRevealFromWorld`)',
     lookCode.includes('systemRevealFromWorld(window.KOSMOS, sys).name === true') && !lookCode.includes('_systemReveal?.('));
}

console.log('\n' + (fail ? 'FAIL' : 'OK') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
