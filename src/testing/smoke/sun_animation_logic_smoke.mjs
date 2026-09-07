// Sun 2.0 / S1 — arytmetyka warstwy gwiazdy + pin przeniesienia GLSL.
// Uruchom: node src/testing/smoke/sun_animation_logic_smoke.mjs
//
// ⚠ SPROSTOWANIE wobec pierwszej wersji tego pliku: twierdziła, że keeper może pokrywać
//   TYLKO czystą arytmetykę, bo reszta slice'u nie importuje się pod node. To było FAŁSZ —
//   SunShader.js importuje się bez problemu, a shadery są TEKSTEM, więc najważniejsza
//   obietnica S1 („GLSL przeniesiony verbatim") jest maszynowo sprawdzalna i jest tu
//   sprawdzana (T0). Bez niej cała reszta pinów mogła świecić na zielono przy zepsutym
//   przeniesieniu — czyli dokładnie tam, gdzie leży ryzyko tego commita.
//
// Pokrycie:
//   T0  GLSL: cztery literały z SunShader.js wobec PRZYPIĘTYCH sum SHA-256.
//       KONTROLA: mutacja jednego znaku zmienia sumę (pin realnie dyskryminuje).
//   T0b Model↔shader: formuła użyta przez solver istnieje DOSŁOWNIE w źródle shadera
//       (limb 0.35/0.65/0.65, gorące centrum 0.45 i uWhitePower*1.7, gran mix 0.55/1.35).
//   T1  sunDiscPx — lustro wzoru drabiny gazowca + klamra dzielenia przez zero.
//   T2  sunDetailLevel — progi co do bitu. KONTROLA: DETAIL_CAP zbija sufit.
//   T3  granFadeEdges — cross ORAZ lo/hi wartością (produktem funkcji jest lo/hi, nie cross;
//       bez pinów na nich cała grupa przechodziła na implementacji ignorującej FADE_MARGIN
//       i FADE_EPS — to była realna dziura, znaleziona mutacją).
//   T3-K Samoadaptacja do etapu 4 Dysona: zmienia się WYŁĄCZNIE uColor (tekstura emission
//       jest nietknięta, więc granNeutral zostaje per klasa — inaczej kontrola mieszałaby
//       dwie przyczyny). luma709(0x9933cc) = 0.13500 policzone transferem sRGB three.
//   T4  Degeneracje, sufit i INWERSJA gwarancji (cross > sufit ⇒ płaska strefa kończy się
//       przed konturem). KONTROLA: sąsiedni przypadek bez inwersji.
//   T5  integratePhase — kontrakt D-V2u. KONTROLA: forma omega*t daje inny wynik.
//   T6  classGranParams (S2) — wyprowadzenie per klasa z temperatury, nie tabela.
//       KONTROLA: oba mnożniki są RÓŻNE (wykładniki 0.6 i 0.8 nie są tym samym) i rosną
//       z temperaturą — inaczej „wyprowadzenie" byłoby stałą przebraną za formułę.
//   T7  granAmplitude (S2) — ciągła rampa po px. KONTROLA: degeneracja pxFull <= pxMin
//       daje próg skokowy, nie NaN.
//   T8  Żywy shader S2 — piny TREŚCI: rozdzielony sunNoise, straż smoothstep, obrót warpu.
//   T9  Żywa korona S3 — kierunek świata, straż normalize, return zamiast discard, NOŚNY
//       sufit. KONTROLA PINU: słowo discard JEST w komentarzu shadera, więc pin bez
//       zdejmowania komentarzy byłby ślepy.
//   T10 Cykl życia protuberancji (S4, D-V2l) — odroczenie z S1 wygasło wraz z wołającym.
//       KONTROLA: env i limbWeight NIE są stałe (trywialna implementacja padłaby).
//   T11 Protuberancje w GLSL — prostokąt przed szumem, snoise(vec2) na płaskim quadzie,
//       DOKŁADNA maska promień-kontra-kula. KONTROLA: maska nie jest testem 2D w quadzie.

import fs from 'fs';
import crypto from 'crypto';
import {
  sunDiscPx, sunDetailLevel, granFadeEdges, integratePhase, FADE_LO_CAP,
  classGranParams, granAmplitude,  promSlotTiming, promEnvelope, limbWeight,
} from '../../renderer/SunAnimationLogic.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ── T0 ───────────────────────────────────────────────────────────────────────
console.log('\nT0 — GLSL przeniesiony verbatim (sumy kontrolne)');
const BT = String.fromCharCode(96);
const shaderSrc = fs.readFileSync(new URL('../../renderer/SunShader.js', import.meta.url), 'utf8');
const pullGlsl = (name) => {
  const open = name + ' = /* glsl */ ' + BT;
  const k = shaderSrc.indexOf(open);
  if (k < 0) return null;
  const start = k + open.length;
  const end = shaderSrc.indexOf(BT, start);
  return end < 0 ? null : shaderSrc.slice(start, end);
};
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);
// ⚠ Sumy wzięte z GLSL, który stał w renderStar w commicie b7c7360 i został przeniesiony
//   bez zmiany ani jednego znaku.
// ⚠ SPROSTOWANIE wobec pierwszej wersji: zapowiadałem, że S2 zmieni fragment rdzenia
//   i suma ma wtedy paść. Tak się NIE stało i nie powinno było: kontrakt kill-switcha
//   wymaga, żeby OFF było stanem sprzed slice'u co do bajtu, a jedynym sposobem, żeby to
//   ZAGWARANTOWAĆ, jest zostawić te literały w spokoju i dopisać warianty *_LIVE obok.
//   Dlatego te cztery sumy mają przechodzić przez CAŁY arc — jeśli któraś padnie, ktoś
//   ruszył ścieżkę OFF i to jest wtedy defekt, a nie planowana zmiana.
const GOLDEN = {
  STAR_CORE_VERT:   { len: 367,  sha: '1698e482ec6d2219' },
  STAR_CORE_FRAG:   { len: 1114, sha: '6b6d6b694a39b94d' },
  STAR_CORONA_VERT: { len: 185,  sha: 'e65a2e6c636d9a8f' },
  STAR_CORONA_FRAG: { len: 324,  sha: 'c768e3449c1aabdb' },
};
for (const [name, g] of Object.entries(GOLDEN)) {
  const src = pullGlsl(name);
  ok(name + ': wyciągnięty ze źródła', typeof src === 'string' && src.length > 40);
  ok(name + ': długość ' + (src ? src.length : '?') + ' == ' + g.len, src && src.length === g.len);
  ok(name + ': sha256/16 == ' + g.sha, src && sha(src) === g.sha);
}
const mutated = pullGlsl('STAR_CORE_FRAG').replace('0.65', '0.66');
ok('KONTROLA: mutacja jednej cyfry zmienia sumę (pin dyskryminuje)',
  sha(mutated) !== GOLDEN.STAR_CORE_FRAG.sha);

console.log('\nT0b — model solvera odpowiada TREŚCI shadera');
const frag = pullGlsl('STAR_CORE_FRAG');
ok('shader ma limb = 0.35 + 0.65 * pow(NdotV, 0.65)', frag.includes('0.35 + 0.65 * pow(NdotV, 0.65)'));
ok('shader ma człon gorącego centrum uBrightness * 0.45', frag.includes('uBrightness * 0.45'));
ok('shader ma wykładnik uWhitePower * 1.7', frag.includes('uWhitePower * 1.7'));
ok('shader ma gran = mix(0.55, 1.35, lum)', frag.includes('mix(0.55, 1.35, lum)'));

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — sunDiscPx (gwiazda G, r_disc = 3.6, 1080p, fov 55)');
const G_DISC = 3.6, VH = 1080, FOV = 55;
const px = (d, r = G_DISC) => sunDiscPx({ radiusWorld: r, distance: d, viewportHeightPx: VH, fovDeg: FOV });
ok('d=450 -> 16.6 px (maks. oddalenie)', near(px(450), 16.60, 0.02));
ok('d=100 -> 74.7 px (typowa ramka układu)', near(px(100), 74.69, 0.02));
ok('d=20  -> 373.4 px (przybliżenie małego kąta; dokładna sylwetka 379.6 = +1.7%,', near(px(20), 373.44, 0.05));
console.log('        odziedziczone świadomie dla parytetu z drabiną gazowca)');
ok('KONTROLA: inny promień -> inna liczba (M 2.34 @ d=100 = 48.6)', near(px(100, 2.34), 48.55, 0.02));
ok('KONTROLA: monotoniczny spadek z dystansem', px(20) > px(100) && px(100) > px(450));
ok('klamra: distance = 0 daje wynik SKOŃCZONY (kamera w środku gwiazdy jest osiągalna)',
  Number.isFinite(px(0)) && px(0) > 0);

// ── T2 ───────────────────────────────────────────────────────────────────────
console.log('\nT2 — sunDetailLevel (progi 260 / 90, cap 2)');
const LAD = { pxFull: 260, pxMed: 90, cap: 2 };
ok('px=1000 -> 2', sunDetailLevel(1000, LAD) === 2);
ok('px=260  -> 2 (granica od góry)', sunDetailLevel(260, LAD) === 2);
ok('px=259.99 -> 1', sunDetailLevel(259.99, LAD) === 1);
ok('px=90   -> 1 (granica od góry)', sunDetailLevel(90, LAD) === 1);
ok('px=89.99 -> 0', sunDetailLevel(89.99, LAD) === 0);
ok('px=0    -> 0', sunDetailLevel(0, LAD) === 0);
ok('KONTROLA: cap=1 zbija 1000 z poziomu 2 na 1', sunDetailLevel(1000, { ...LAD, cap: 1 }) === 1);
ok('KONTROLA: cap=0 zbija wszystko na 0', sunDetailLevel(1000, { ...LAD, cap: 0 }) === 0);

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — granFadeEdges: solver D-V2e');
// lumaA = luma709(uColor_linear) * uBrightness; whiteCoef = uBrightness * 0.45.
// granNeutral = ZMIERZONA średnia z wypakowanych PNG emission (audyt), nie nominał.
const CLASSES = {
  M: { lumaA: 0.3223 * 3.5, whiteCoef: 3.5 * 0.45, whitePower: 0.8, granNeutral: 0.693, brightness: 3.5, cross: 0.3966, lo: 0.5756, hi: 0.8256 },
  K: { lumaA: 0.50656 * 3.2, whiteCoef: 3.2 * 0.45, whitePower: 0.9, granNeutral: 0.782, brightness: 3.2, cross: 0.2753, lo: 0.4179, hi: 0.6679 },
  G: { lumaA: 0.9404 * 2.8, whiteCoef: 2.8 * 0.45, whitePower: 1.2, granNeutral: 0.907, brightness: 2.8, cross: 0.0312, lo: 0.1006, hi: 0.3506 },
  F: { lumaA: 1.0000 * 2.5, whiteCoef: 2.5 * 0.45, whitePower: 1.5, granNeutral: 1.012, brightness: 2.5, cross: 0.0166, lo: 0.0816, hi: 0.3316 },
};
const BAND = 0.25;
// ⚠ To NIE jest formuła niezależna od solvera — jest przepisana z tego samego modelu.
//   Sprawdza WYŁĄCZNIE, że bisekcja zbiegła do pierwiastka. Zgodność modelu z shaderem
//   pilnuje T0b (tekst źródła), a wartości pilnują przypięte liczby niżej.
const lumaAt = (c, N) =>
  c.lumaA * (0.35 + 0.65 * Math.pow(N, 0.65)) * c.granNeutral
  + c.whiteCoef * Math.pow(N, c.whitePower * 1.7);

for (const [k, c] of Object.entries(CLASSES)) {
  const e = granFadeEdges({ ...c, band: BAND });
  ok('klasa ' + k + ': cross = ' + e.cross.toFixed(4) + ' (tabela ' + c.cross.toFixed(4) + ')',
    near(e.cross, c.cross, 0.001));
  ok('klasa ' + k + ': bisekcja zbiegła — L(cross) == 1.0', near(lumaAt(c, e.cross), 1.0, 1e-6));
  // ⚠ TO są piny, których brakowało: lo/hi to jedyny PRODUKT funkcji (to je czyta sunInfo
  //   i to je dostanie shader w S2). Bez nich implementacja ignorująca FADE_MARGIN/FADE_EPS
  //   przechodziła całą grupę — sprawdzone mutacją.
  ok('klasa ' + k + ': lo = ' + e.lo.toFixed(4) + ' (tabela ' + c.lo.toFixed(4) + ')', near(e.lo, c.lo, 0.001));
  ok('klasa ' + k + ': hi = ' + e.hi.toFixed(4) + ' (tabela ' + c.hi.toFixed(4) + ')', near(e.hi, c.hi, 0.001));
  ok('klasa ' + k + ': hi - lo == band (rampa ma zadaną szerokość)', near(e.hi - e.lo, BAND, 1e-9));
  ok('klasa ' + k + ': lo > cross — kontur JEST w płaskiej strefie (sens całej funkcji)', e.lo > e.cross);
  ok('klasa ' + k + ': inverted === false', e.inverted === false);
}

console.log('\nT3-KONTROLA — samoadaptacja do etapu 4 Dysona (uColor 0x9933cc)');
// ⚠ luma709 policzona transferem sRGB→linear three r171: (0.31855, 0.03310, 0.60383)
//   -> 0.2126*r + 0.7152*g + 0.0722*b = 0.13500. (Pierwsza wersja tego pliku miała 0.1237 —
//   liczbę, która nie jest ani Rec.709, ani Rec.601 tego koloru. Błąd, nie konwencja.)
// ⚠ granNeutral ZOSTAJE per klasa: etap 4 przemalowuje wyłącznie uColor, tekstury emission
//   nie tyka, więc podmiana obu naraz mieszałaby dwie przyczyny w jednej kontroli.
const DYSON_LUMA = 0.13500;
const DYSON_EXPECT = { M: 0.5723, K: 0.6347, G: 0.7473, F: 0.8231 };
for (const [k, c] of Object.entries(CLASSES)) {
  const d = granFadeEdges({
    lumaA: DYSON_LUMA * c.brightness, whiteCoef: c.whiteCoef,
    whitePower: c.whitePower, granNeutral: c.granNeutral, band: BAND,
  });
  ok('etap 4, klasa ' + k + ': cross = ' + d.cross.toFixed(4) + ' (oczekiwane ' + DYSON_EXPECT[k].toFixed(4) + ')',
    near(d.cross, DYSON_EXPECT[k], 0.001));
  ok('etap 4, klasa ' + k + ': kontur WĘDRUJE w głąb tarczy (+' + (d.cross - c.cross).toFixed(3) + ')',
    d.cross > c.cross + 0.1);
}

// ── T4 ───────────────────────────────────────────────────────────────────────
console.log('\nT4 — degeneracje, sufit, inwersja gwarancji');
const base = { whiteCoef: 1.26, whitePower: 1.2, granNeutral: 1.0, band: BAND };
const allAbove = granFadeEdges({ ...base, lumaA: 50 });
ok('cała tarcza NAD progiem -> brak konturu, brak wygaszania',
  allAbove.cross === null && allAbove.lo === 0 && allAbove.hi === 0);
const allBelow = granFadeEdges({ ...base, lumaA: 0.01, whiteCoef: 0.01 });
ok('cała tarcza POD progiem -> brak konturu, brak wygaszania',
  allBelow.cross === null && allBelow.lo === 0 && allBelow.hi === 0);
const zeroBand = granFadeEdges({ ...CLASSES.M, band: 0 });
ok('band = 0 -> lo === hi, bez NaN (⚠ w GLSL to smoothstep z dzieleniem przez zero — S2)',
  zeroBand.lo === zeroBand.hi && Number.isFinite(zeroBand.lo));

// Inwersja: gdy kontur wypadnie POWYŻEJ sufitu, płaska strefa kończy się PRZED nim.
const FSHAPE = { whiteCoef: 2.5 * 0.45, whitePower: 1.5, granNeutral: 1.0, band: BAND };
const inv = granFadeEdges({ ...FSHAPE, lumaA: 0.25 });
const notInv = granFadeEdges({ ...FSHAPE, lumaA: 0.30 });
ok('inwersja: lumaA=0.25 -> cross ' + inv.cross.toFixed(4) + ' > sufit ' + FADE_LO_CAP + ', inverted === true',
  inv.cross > FADE_LO_CAP && inv.lo === FADE_LO_CAP && inv.inverted === true);
ok('KONTROLA: lumaA=0.30 -> cross ' + notInv.cross.toFixed(4) + ' < sufit, inverted === false',
  notInv.cross < FADE_LO_CAP && notInv.inverted === false);
ok('sufit FADE_LO_CAP trzyma w obu przypadkach', inv.lo === FADE_LO_CAP && notInv.lo === FADE_LO_CAP);

// ── T5 ───────────────────────────────────────────────────────────────────────
console.log('\nT5 — integratePhase: kontrakt D-V2u (akumulacja, nie omega*t)');
// ⚠ Od poprawki po przeglądzie ta funkcja MA konsumenta produkcyjnego: obrót gwiazdy
//   w _tickClouds idzie przez nią, więc pin dotyczy kodu, który gra naprawdę wykonuje.
const RATE = 0.03, STEP = 1 / 60;
let ph = 0;
for (let i = 0; i < 600; i++) ph = integratePhase(ph, RATE, STEP);
ok('600 kroków po 1/60 s przy 0.03 rad/s -> 0.30 rad', near(ph, 0.30, 1e-12));

let phSplit = 0;
for (let i = 0; i < 300; i++) phSplit = integratePhase(phSplit, 0.03, STEP);
for (let i = 0; i < 300; i++) phSplit = integratePhase(phSplit, 0.06, STEP);
const omegaT = 0.06 * 10;
ok('akumulacja: 0.03*5 + 0.06*5 = 0.45 rad (zmiana tempa = zmiana PRĘDKOŚCI)',
  near(phSplit, 0.45, 1e-12));
ok('KONTROLA: forma omega*t dałaby 0.60 rad — SKOK o 0.15 rad w jednej klatce (V-270)',
  near(omegaT, 0.60, 1e-12) && !near(phSplit, omegaT, 1e-6));

// ── T6 ───────────────────────────────────────────────────────────────────────
console.log('\nT6 — classGranParams: wyprowadzenie z temperatury (D-V2p)');
const TEMPS = { M: 3500, K: 4500, G: 5800, F: 7000 };
const EXPECT_FREQ = { M: 0.739, K: 0.859, G: 1.000, F: 1.119 };
const EXPECT_BOIL = { M: 0.668, K: 0.816, G: 1.000, F: 1.162 };
for (const [k, T] of Object.entries(TEMPS)) {
  const p = classGranParams({ temperature: T });
  ok('klasa ' + k + ': freqMult = ' + p.freqMult.toFixed(3) + ' (tabela ' + EXPECT_FREQ[k].toFixed(3) + ')',
    near(p.freqMult, EXPECT_FREQ[k], 0.001));
  ok('klasa ' + k + ': boilMult = ' + p.boilMult.toFixed(3) + ' (tabela ' + EXPECT_BOIL[k].toFixed(3) + ')',
    near(p.boilMult, EXPECT_BOIL[k], 0.001));
}
ok('G (5800 K) jest punktem odniesienia: oba mnożniki dokładnie 1.0',
  classGranParams({ temperature: 5800 }).freqMult === 1 && classGranParams({ temperature: 5800 }).boilMult === 1);
ok('monotoniczność: chłodniejsza gwiazda ma WIĘKSZE komórki (niższa częstotliwość)',
  classGranParams({ temperature: 3500 }).freqMult < classGranParams({ temperature: 7000 }).freqMult);
ok('KONTROLA: freqMult != boilMult poza G — to są dwa RÓŻNE wykładniki, nie jedna stała',
  !near(classGranParams({ temperature: 3500 }).freqMult, classGranParams({ temperature: 3500 }).boilMult, 1e-6)
  && !near(classGranParams({ temperature: 7000 }).freqMult, classGranParams({ temperature: 7000 }).boilMult, 1e-6));
ok('KONTROLA: brak/zerowa temperatura spada na G, nie na NaN',
  classGranParams({}).freqMult === 1 && Number.isFinite(classGranParams({ temperature: 0 }).boilMult));

// ── T7 ───────────────────────────────────────────────────────────────────────
console.log('\nT7 — granAmplitude: ciągła rampa po średnicy tarczy (D-V2v)');
const AMP = { pxMin: 70, pxFull: 180 };
ok('px=0   -> 0 (przy domyślnej ramce układu granulacji NIE MA — D-V2ab)', granAmplitude(0, AMP) === 0);
ok('px=70  -> 0 (dolny brzeg)', granAmplitude(70, AMP) === 0);
ok('px=125 -> 0.5 (środek rampy, smoothstep)', near(granAmplitude(125, AMP), 0.5, 1e-9));
ok('px=180 -> 1 (górny brzeg)', granAmplitude(180, AMP) === 1);
ok('px=400 -> 1 (nasycenie)', granAmplitude(400, AMP) === 1);
ok('monotoniczność na całej rampie',
  granAmplitude(80, AMP) < granAmplitude(120, AMP) && granAmplitude(120, AMP) < granAmplitude(160, AMP));
ok('KONTROLA: degeneracja pxFull <= pxMin daje próg skokowy, nie NaN',
  granAmplitude(100, { pxMin: 180, pxFull: 180 }) === 0
  && granAmplitude(200, { pxMin: 180, pxFull: 180 }) === 1);

// ── T8 ───────────────────────────────────────────────────────────────────────
console.log('\nT8 — żywy shader S2: piny TREŚCI (GLSL nie jest wykonywalny w sweepie)');
const liveFrag = pullGlsl('STAR_CORE_FRAG_LIVE');
ok('żywy wariant istnieje i jest ISTOTNIE dłuższy od verbatim', liveFrag && liveFrag.length > frag.length);
ok('sunNoise ma ROZDZIELONY kierunek mieszania i punkt próbkowania (D-V2t)',
  liveFrag.includes('float sunNoise(vec3 dir, vec3 p, float scale)')
  && liveFrag.includes('vec3 w = abs(dir);'));
ok('warp OBRACA się w płaszczyźnie stycznej (kipienie w miejscu, nie dryf — D-V2d)',
  liveFrag.includes('w1 * ca - w2 * sa') && liveFrag.includes('w1 * sa + w2 * ca'));
ok('faza kipienia przychodzi UNIFORMEM, nie jest liczona jako omega*czas (D-V2u)',
  liveFrag.includes('uniform float uBoilPhase;') && !/uBoilHz\s*\*/.test(liveFrag));
ok('STRAŻ smoothstep: hi > lo sprawdzane przed użyciem (edge0 == edge1 dzieli przez zero)',
  liveFrag.includes('(uGranFadeHi > uGranFadeLo)'));
ok('granulacja MIESZA się z teksturą, nie zastępuje jej (D-V2b)',
  liveFrag.includes('mix(granTex, granTex * granProc, uGranMix)'));
ok('drabina 2/3/4: druga oktawa odpada dokładnie na poziomie 1 (warp ją zastępuje)',
  liveFrag.includes('bool secondOctave = (uSunDetail != 1);'));
ok('żywy vertex wystawia pozycję obiektu (granulacja jest w przestrzeni obiektu)',
  pullGlsl('STAR_CORE_VERT_LIVE').includes('vObjPos = position;'));
// ⚠ Wynik live-gate S2 (wariant A): bramka zeszła do roli PODŁOGI. Pin trzyma wartość,
//   bo 0.25 i 0.08 dają WIDOCZNIE inny kawałek tarczy przy pełnym kontraście, a 0 wyłącza
//   mechanizm w całości (shader wchodzi wtedy w gałąź granFade = 1.0).
ok('shipowany GUARD_BAND == 0.08 (podłoga po wariancie A, NIE 0 i NIE 0.25)',
  shaderSrc.includes('GUARD_BAND: 0.08,'));
const shipped = granFadeEdges({ ...CLASSES.M, band: 0.08 });
ok('przy shipowanym bandzie M: lo ' + shipped.lo.toFixed(4) + ' bez zmian, hi ' + shipped.hi.toFixed(4) + ' = lo + 0.08',
  near(shipped.lo, CLASSES.M.lo, 0.001) && near(shipped.hi - shipped.lo, 0.08, 1e-9));
ok('KONTROLA: band NIE rusza strefy płaskiej — lo identyczne przy 0.08 i 0.25 (lewarem jest FADE_MARGIN)',
  granFadeEdges({ ...CLASSES.M, band: 0.08 }).lo === granFadeEdges({ ...CLASSES.M, band: 0.25 }).lo);

ok('KONTROLA: wariant VERBATIM nie zna ANI JEDNEGO uniformu S2 — ścieżka OFF nietknięta',
  !frag.includes('uGranMix') && !frag.includes('uBoilPhase') && !frag.includes('sunNoise'));

// ── T9 ───────────────────────────────────────────────────────────────────────
console.log('\nT9 — żywa korona S3: piny TREŚCI');
const coronaFrag = pullGlsl('STAR_CORONA_FRAG');
const coronaLive = pullGlsl('STAR_CORONA_FRAG_LIVE');
ok('żywy wariant korony istnieje i jest istotnie dłuższy od verbatim',
  coronaLive && coronaLive.length > coronaFrag.length * 2);
ok('kierunek liczony w przestrzeni ŚWIATA z bazy kamery, nie jako kąt ekranowy (D-V2h)',
  coronaLive.includes('uSunCamRight * vP.x + uSunCamUp * vP.y'));
ok('STRAŻ normalize: środek quada (vP = 0) nie produkuje NaN — kamera bywa w środku tarczy',
  coronaLive.includes('(d > 1e-4)'));
// ⚠ Pin NEGATYWNY musi czytać KOD, nie komentarze: shader tłumaczy w komentarzu, DLACZEGO
//   nie używa discard, więc naiwne includes('discard') zawsze by padało. To jest dokładnie
//   reguła domu o pinach źródłowych (zdejmuj komentarze + zawsze miej kontrolę pinu).
const stripComments = (t) => t.replace(/\/\/[^\n]*/g, '');
const coronaLiveCode = stripComments(coronaLive);
ok('wczesne wyjście PRZED szumem i przez return, NIE discard (early-Z zostaje)',
  coronaLiveCode.includes('if (I < 0.002)') && coronaLiveCode.includes('return;')
  && !coronaLiveCode.includes('discard'));
ok('KONTROLA pinu: słowo discard JEST w komentarzu, więc pin bez zdejmowania komentarzy byłby ślepy',
  coronaLive.includes('discard') && !coronaLiveCode.includes('discard'));
// ⚠ Od S4 pod sufitem stoi SUMA korony i protuberancji. To nie jest kosmetyka: gdyby
//   protuberancje dodawano PO clampie, sufit przestałby cokolwiek gwarantować, a cała
//   podprogowość D-V2k opiera się właśnie na tym, że przechodzą przez to samo min().
ok('SUFIT NOŚNY: SUMA korony i protuberancji przechodzi przez min(..., uCoronaGuard) (D-V2i)',
  coronaLive.includes('min(uColor * uGain * I * S + prom, vec3(uCoronaGuard))'));
ok('KONTROLA: nic nie jest dodawane do koloru PO clampie (sufit byłby wtedy fikcją)',
  !/vec3 c = min\([^;]*\);[\s\S]{0,200}c \+=/.test(coronaLive));
ok('faza dryfu przychodzi UNIFORMEM, nie jest liczona jako omega*czas (D-V2u)',
  coronaLive.includes('uniform float uStreamerPhase;') && !/uStreamerDrift\s*\*/.test(coronaLive));
ok('pole zależy od kierunku, nie od promienia (promieniste smugi, nie plamy)',
  coronaLive.includes('sphereNoise(sr, 3.2)') && !/sphereNoise\([^)]*\bd\b/.test(coronaLive));
ok('shipowany CORONA_GUARD == 0.98', shaderSrc.includes('CORONA_GUARD:   0.98,'));
ok('KONTROLA: wariant VERBATIM korony nie zna ANI JEDNEGO uniformu S3 — ścieżka OFF nietknięta',
  !coronaFrag.includes('uStreamerPhase') && !coronaFrag.includes('uCoronaGuard')
  && !coronaFrag.includes('uSunCamRight'));
ok('KONTROLA: vertex korony jest WSPÓLNY — żywa ścieżka nie dodała ani jednego varying',
  pullGlsl('STAR_CORONA_VERT') !== null && !shaderSrc.includes('STAR_CORONA_VERT_LIVE'));

// ── T10 ──────────────────────────────────────────────────────────────────────
console.log('\nT10 — cykl życia protuberancji (D-V2l); odroczenie z S1 wygasło');
const tim = promSlotTiming(0.5, 0.5);
const slotMid = { ...tim, offset: 0 };
const totalMid = tim.dormant + tim.rise + tim.sustain + tim.collapse;
ok('rise/collapse są STAŁE (4 s / 6 s)', tim.rise === 4 && tim.collapse === 6);
ok('dormant w [25,70]: ' + tim.dormant.toFixed(1), tim.dormant >= 25 && tim.dormant <= 70);
ok('sustain w [12,25]: ' + tim.sustain.toFixed(1), tim.sustain >= 12 && tim.sustain <= 25);
ok('skrajne losowania trafiają w brzegi przedziałów',
  promSlotTiming(0, 0).dormant === 25 && promSlotTiming(1, 1).dormant === 70
  && promSlotTiming(0, 0).sustain === 12 && promSlotTiming(1, 1).sustain === 25);
// ⚠ Anty-kicz jest LICZBĄ: wypełnienie ~0.375 x 4 sloty = ~1,5 aktywnego, a ważenie
//   limbem ścina to mniej więcej o połowę — „zwykle jedna, czasem dwie, czasem żadna".
ok('wypełnienie cyklu = 0.375 (aktywne 28.5 s / 76 s)',
  near((totalMid - tim.dormant) / totalMid, 0.375, 1e-9));
ok('faza dormant: env == 0', promEnvelope(0, slotMid).env === 0 && promEnvelope(40, slotMid).env === 0);
ok('faza rise: env rośnie z 0 do 1', promEnvelope(48, slotMid).env < promEnvelope(50, slotMid).env);
ok('faza sustain: env == 1', promEnvelope(60, slotMid).env === 1);
ok('faza collapse: env maleje', promEnvelope(70.5, slotMid).env > promEnvelope(73, slotMid).env);
ok('cykl jest OKRESOWY: env(t) == env(t + total)',
  near(promEnvelope(60, slotMid).env, promEnvelope(60 + totalMid, slotMid).env, 1e-12));
ok('ujemny czas nie psuje modulo (env skończone, w [0,1])',
  Number.isFinite(promEnvelope(-500, slotMid).env)
  && promEnvelope(-500, slotMid).env >= 0 && promEnvelope(-500, slotMid).env <= 1);
ok('KONTROLA: env NIE jest stałe — trywialna implementacja zwracająca 1 padłaby',
  promEnvelope(0, slotMid).env !== promEnvelope(60, slotMid).env);
ok('limbWeight: 1 na limbie (dot 0), 0 poza pasmem, symetryczne względem znaku',
  near(limbWeight(0, 0.55), 1, 1e-12) && limbWeight(0.55, 0.55) === 0
  && near(limbWeight(0.3, 0.55), limbWeight(-0.3, 0.55), 1e-12));
ok('KONTROLA: limbWeight NIE jest stałe i maleje monotonicznie od limbu',
  limbWeight(0.1, 0.55) > limbWeight(0.3, 0.55) && limbWeight(0.3, 0.55) > limbWeight(0.5, 0.55));

// ── T11 ──────────────────────────────────────────────────────────────────────
console.log('\nT11 — protuberancje w GLSL: piny TREŚCI');
const promCode = stripComments(coronaLive);
ok('slot ma prostokąt ograniczający PRZED szumem (idiom gasStormEffect)',
  /if \(abs\(loc\.x\) > 1\.2[\s\S]{0,80}return vec3\(0\.0\);/.test(promCode));
ok('na PŁASKIM quadzie używa snoise(vec2), a NIE sphereNoise (3x drożej, bez sensu)',
  promCode.includes('snoise(vec2(loc.x') && !/sphereNoise\(vec2/.test(promCode));
ok('MASKA SYLWETKI jest dokładna: promień-kontra-kula w świecie (D-V2y)',
  promCode.includes('float perp = sqrt(max(dot(oc, oc) - bq * bq, 0.0));')
  && promCode.includes('smoothstep(uCoreRadius * 0.995, uCoreRadius * 1.02, perp)'));
ok('KONTROLA: maska NIE jest testem promienia w przestrzeni quada (rzut równoległy)',
  !/outsideDisc = smoothstep\([^)]*\bd\b/.test(promCode));
ok('protuberancje są przemnażane przez maskę, nie dodawane obok niej',
  promCode.includes('prom *= outsideDisc;'));
ok('cały blok stoi za bramką uPromAny (dormant sloty nie płacą za maskę ani szum)',
  promCode.includes('if (uPromAny > 0.5)'));
ok('kierunek promienisty z samej kotwicy, bez budowania bazy',
  promCode.includes('vec2 up = normalize(P.xy);'));
ok('STRAŻ: zerowa kotwica nie wchodzi do normalize (osobliwość == wygaszenie)',
  promCode.includes('dot(P.xy, P.xy) < 1e-8'));

// ── T12 ──────────────────────────────────────────────────────────────────────
console.log('\nT12 — każde pokrętło LIVE_SUN jest albo ŻYWE, albo jawnie BAKED');
// ⚠ Ten pin powstał, bo S4 przemycił oba defekty naraz: PROM_DRIFT zadeklarowane
//   i nigdy nieczytane (kształt usunięty przez 1079cd9), a PROM_GAIN czytane tylko przy
//   budowie materiału — przez co krok 5 re-gate'u („PROM_GAIN = 3 → brak zmiany")
//   wyglądał na dowód nasycenia sufitu, a był brakiem podpięcia pokrętła.
//   Pokrętło, które nie jest ani żywe, ani opisane jako baked, kosztuje rundę gate'u.
const rendererSrc = fs.readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8');
const liveSunBlock = shaderSrc.slice(shaderSrc.indexOf('const LIVE_SUN = {'),
                                     shaderSrc.indexOf('};', shaderSrc.indexOf('const LIVE_SUN = {')));
const knobs = [...liveSunBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map(m => m[1]);
ok('LIVE_SUN ma sensowną liczbę pokręteł (' + knobs.length + ')', knobs.length >= 15);
const orphans = [];
for (const k of knobs) {
  const live  = rendererSrc.includes('T.' + k) || rendererSrc.includes('LIVE_SUN.' + k);
  const baked = new RegExp('^\\s*' + k + ':.*//.*BAKED', 'm').test(liveSunBlock);
  if (!live && !baked) orphans.push(k);
}
ok('żadne pokrętło nie jest sierotą (ani czytane, ani oznaczone BAKED): ' +
   (orphans.length ? orphans.join(', ') : 'brak'), orphans.length === 0);
ok('KONTROLA: pin dyskryminuje — zmyślone pokrętło zostałoby wykryte jako sierota',
   !(rendererSrc.includes('T.PROM_NIE_ISTNIEJE') || /^\s*PROM_NIE_ISTNIEJE:.*BAKED/m.test(liveSunBlock)));
ok('PROM_DRIFT nie wrócił jako martwe pole', !knobs.includes('PROM_DRIFT'));

// ── wynik ────────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
