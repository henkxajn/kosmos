// SkyCatalog — katalog nieba z galaktyki (ARC GALAXY, krok NIEBO — docs/design/GALAXY_PLAN.md §4, D-GX-4/5/6, F7).
//
// Niebo tła jest TĄ SAMĄ galaktyką co mapa: 71 prawdziwych układów (`galaxyData.systems`, pozycje w ly) widzianych
// z aktywnego układu + gwiazdy tła w powłoce 30–3 000 ly wokół domu, w rozkładzie OBJĘTOŚCIOWYM (D-GX-5 (a) —
// gęstość rzeczywista). Ten sam seed galaktyki ⇒ to samo niebo; inny układ ⇒ inne niebo (przesuwa się 71 prawdziwych
// gwiazd, tło praktycznie nie — zmierzone w fazie A: paralaksa tła między skrajnymi układami ~0,43°).
//
// CZYSTY moduł: bez three, bez DOM, bez `window`, bez `Math.random` (D-GX-6: zanim galaktyka istnieje, niebo jest
// PUSTE — nigdy pole z `Math.random`). Jedyny import: SeedMath (rozproszenie ziarna).
//
// ⚠ ZIARNO (lekcja W2 / GALAXY_SEED, `SeedMath.js`): NIGDY pierwszy rzut surowego ziarna. Strumień nieba =
//   mulberry32(mixSeed(seed ^ SKY_SALT)) rozgrzany SKY_WARMUP rzutami — inny niż strumień `GalaxyGenerator`
//   (mulberry32(seed) wprost) i niż strumienie `EmpireGenerator` (sole 0x0B1EC7, 0x7A17C5).
// ⚠ Każda gwiazda tła zużywa DOKŁADNIE SKY_DRAWS_PER_STAR rzutów, więc zmiana liczby gwiazd (pokrętło FILLER_COUNT)
//   zostawia pierwsze gwiazdy na miejscu — rośnie albo maleje tylko ogon katalogu.
// ⚠ OSIE: katalog trzyma pozycje w osiach GALAKTYKI (x, y w płaszczyźnie, z = grubość dysku). Kierunki dla sceny 3D
//   wychodzą w osiach ŚWIATA Three.js: X = gx, Y = gz (wysokość), Z = gy — to samo odwzorowanie co
//   HolotableCamera (dawniej także StratcomGalaxyRenderer), żeby płyta galaktyki (G1) i niebo zgadzały się co do kierunku (F2).
// ⚠ JASNOŚĆ — prawo magnitudo, nie surowe L/d² (D-GX-5 (ii)): strumień L/d² tła ma rozpiętość > 4 rzędów, a najbliższy
//   prawdziwy układ jest ~3 000× jaśniejszy od najjaśniejszej gwiazdy tła (faza A) — liniowo albo wszystko zgaśnie,
//   albo wszystko się przepali. Intensywność jest liniowa w magnitudo (logarytm strumienia), z podłogą (MAG_LIMIT,
//   I_MIN) i MIĘKKIM sufitem HDR (KNEE → CAP, asymptota — najjaśniejsze gwiazdy się różnią, nie stają się jednym
//   kolorem). Rozmiar punktu z intensywności (sprzężenie dawnego nieba: rozmiar ∝ b⁵ przy intensywności ∝ b⁶).

import { mixSeed, hashStringToInt } from './SeedMath.js';

// ── Stałe katalogu ────────────────────────────────────────────────────────────────────────────────────────────────
export const SKY_SALT = 0x5C7CA7;          // sól strumienia nieba (unikalna w repo)
export const SKY_WARMUP = 3;               // rzuty rozgrzewki (wzór SunShader.sunSeedFromId)
export const SKY_DRAWS_PER_STAR = 6;       // r, θ, φ, klasa, rozrzut jasności, faza oddechu
export const SKY_SHELL_LY = Object.freeze({ IN: 30, OUT: 3000 });   // powłoka tła [ly] wokół domu (F7)
// Promień punktu na kopule [j. świata] — pasmo dawnej powłoki 300–1 000 (D-GX-4). Kopuła rysuje się bez testu głębi,
// więc promień NIE wpływa na obraz (rozmiar punktu jest w px); mapujemy go z odległości (log), żeby bliższe gwiazdy
// leżały bliżej — porządek bez skutków ubocznych.
export const SKY_DOME_WU = Object.freeze({ MIN: 300, MAX: 1000 });
export const SKY_DOME_LY = Object.freeze({ NEAR: 2, FAR: 3100 });   // odległość [ly] ↔ krańce pasma kopuły

// Paleta ciała doskonale czarnego wg klasy (liniowe RGB, max kanał 1) — ciągłość z dawną paletą nieba
// (błękitne O/B/A 0,62/0,75/1,00 · F 0,95/0,97/1,00 · G 1,00/0,94/0,82 · K 1,00/0,78/0,55 · M 1,00/0,58/0,40).
export const SKY_CLASSES = Object.freeze(['O', 'B', 'A', 'F', 'G', 'K', 'M']);
export const SKY_CLASS_RGB = Object.freeze({
  O: Object.freeze([0.60, 0.70, 1.00]),
  B: Object.freeze([0.66, 0.76, 1.00]),
  A: Object.freeze([0.80, 0.86, 1.00]),
  F: Object.freeze([0.95, 0.97, 1.00]),
  G: Object.freeze([1.00, 0.94, 0.82]),
  K: Object.freeze([1.00, 0.78, 0.55]),
  M: Object.freeze([1.00, 0.58, 0.40]),
});
// Udziały klas wśród gwiazd TŁA — udziały dawnej palety nieba (niebo widziane gołym okiem jest selekcją po
// strumieniu, więc gorące gwiazdy są nadreprezentowane wobec zwykłego rozkładu klas): O/B/A 22 %, F 36 %, G 22 %,
// K 14 %, M 6 %.
export const SKY_FILLER_SHARE = Object.freeze({ O: 0.01, B: 0.07, A: 0.14, F: 0.36, G: 0.22, K: 0.14, M: 0.06 });
// Jasność gwiazd tła [L☉] — środek klasy, rozrzut ±SKY_LUM_SCATTER_DEX (równomiernie w logarytmie).
export const SKY_FILLER_LUM = Object.freeze({ O: 400, B: 60, A: 10, F: 2.5, G: 1.0, K: 0.6, M: 0.08 });
export const SKY_LUM_SCATTER_DEX = 0.5;
// Zapas dla prawdziwego układu bez pola `luminosity` (= STAR_TYPES.luminosity; bez importu konfiguracji gry).
export const SKY_REAL_LUM_DEFAULT = Object.freeze({ M: 0.04, K: 0.4, G: 1.0, F: 3.0 });

// ── Pokrętła (strojenie na bramce): KOSMOS.threeRenderer.skyTuning.<KLUCZ> = wartość ─────────────────────────────
// ⚠ ThreeRenderer trzyma ALIAS tego obiektu (nie kopię), a `_tickSky` porównuje go co klatkę z migawką: zmiana
//   pokrętła przelicza niebo w następnej klatce (FILLER_COUNT — przebudowuje katalog). Każde pole ma czytelnika
//   w tym module (reguła V-266 — pole przed czytelnikiem to zaślepka).
// ⚠ MAG_LIMIT / SLOPE skalibrowane sondą kroku NIEBO (6 ziaren, widok z domu) na statystyki DAWNEGO nieba: mediana
//   intensywności tła ≈ 0,09, ok. 16 % gwiazd tła ponad 1,0 (HDR → bloom) — tyle ma dawne niebo (zmierzone; komentarz
//   przy nim mówi „~3 %"). 71 prawdziwych sąsiadów ląduje pod miękkim sufitem (ok. 2,0–2,55). Warianty rzadsze do
//   sprawdzenia okiem na bramce: SLOPE 0,294 · MAG_LIMIT 16,14 (8 % ponad 1,0; sąsiedzi 1,5–2,4 — bardziej zróżnicowani)
//   i 0,204 · 16,25 (3 % — „jak komentarz"); na arkuszu kontaktowym wariant 8 % wyglądał wyraźnie rzadziej od dawnego.
// ⚠ FILLER_COUNT = 14 000 — wybór właściciela na bramce NIEBO (rama F7: ~7 000). Gęstość PRAWDZIWA przy 7 000: w kadrze
//   domyślnym (450 j.) kopuła daje 660 gwiazd, a dawna powłoka 1 928 (zmierzone rzutem przez żywą kamerę), bo powłoka
//   siedzi wokół POCZĄTKU świata i kadr patrzy na nią z 450 j. poza środkiem — dawna „gęstość" była paralaksą kamery.
//   20 400 odtwarza dawną gęstość w kadrze domyślnym (1 969 w kadrze); 14 000 — pośrodku.
// ⚠ PRAWDZIWE UKŁADY MAJĄ WŁASNY SUFIT (korekta 1 bramki NIEBO). Wzmocnienie REAL_BOOST_MAG działało PRZED wspólnym
//   miękkim sufitem tła (asymptota CAP 2,6), który je połykał: z Kochab, boost 0 → 2 dawał najjaśniejszej prawdziwej
//   gwieździe 2,562 → 2,579 (+0,7 %, zmierzone w grze). Teraz: jasność prawdziwej gwiazdy = prawo tła (z jego sufitem,
//   BEZ ZMIAN — przy boost 0 obraz co do bitu jak wcześniej) × 10^(0,4·boost), a dopiero potem WŁASNY miękki sufit od CAP
//   do REAL_CAP; rozmiar dostaje ponad CAP zapas do REAL_SIZE_GAIN px. Monotoniczne i widoczne.
// ⚠ REAL_BOOST_MAG = 0,3 — PASS właściciela na bramce (korekta 2): z Kochab najjaśniejsza prawdziwa 3,091 przy tle 2,416
//   (przy 0 — 2,562; zmierzone w grze). Wartości domyślne 14 000 / 0,3 / 4,5 zatwierdzone razem.
export const LIVE_SKY = {
  FILLER_COUNT:   14000,  // liczba gwiazd tła (zmiana = przebudowa katalogu) — wybór właściciela na bramce
  MAG_LIMIT:      16.09,  // „podłoga magnitudo": gwiazdy słabsze świecą I_MIN
  I_MIN:          0.05,   // intensywność najsłabszej gwiazdy (dawne minimum)
  SLOPE:          0.448,  // przyrost intensywności na 1 magnitudo jaśniej od MAG_LIMIT
  KNEE:           1.0,    // początek miękkiego sufitu (próg bloomu = 1,0)
  CAP:            2.6,    // sufit HDR tła (asymptota; dawne maksimum 2,65)
  SIZE_MIN:       1.6,    // px — dawne 1,6
  SIZE_GAIN:      3.4,    // px — dawne 3,4 (max 5 px)
  SIZE_EXP:       0.8333, // rozmiar ∝ ((I − I_MIN)/(CAP − I_MIN))^(5/6) — sprzężenie dawnego nieba
  REAL_BOOST_MAG: 0.3,    // magnitudo dodane 71 prawdziwym układom PO suficie tła (dodatnie = jaśniej) — PASS właściciela
  REAL_CAP:       4.5,    // WŁASNY sufit HDR prawdziwych układów (miękki, od CAP do REAL_CAP)
  REAL_SIZE_GAIN: 2.0,    // px zapasu rozmiaru prawdziwej gwiazdy ponad CAP (pełny przy REAL_CAP)
};

// ── PRNG ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ziarno strumienia nieba (uint32) z ziarna galaktyki — rozproszone i solone. */
export function skyStreamSeed(galaxySeed) {
  return mixSeed(((Number(galaxySeed) || 0) ^ SKY_SALT) >>> 0);
}

/** Strumień nieba: rozproszone ziarno + rozgrzewka (nigdy pierwszy rzut surowego ziarna). */
export function makeSkyRng(galaxySeed) {
  const rng = mulberry32(skyStreamSeed(galaxySeed));
  for (let i = 0; i < SKY_WARMUP; i++) rng();
  return rng;
}

/**
 * Ziarno nieba dla `galaxyData`: pole `seed` (GALAXY_SEED); zapis sprzed GALAXY_SEED (bez pola) — ziarno z TREŚCI
 * galaktyki (id + pozycje), deterministyczne dla danego pliku.
 */
export function skySeedOf(galaxyData) {
  const s = galaxyData?.seed;
  if (typeof s === 'number' && Number.isFinite(s)) return s | 0;
  let txt = '';
  for (const x of galaxyData?.systems ?? []) txt += `${x?.id}:${x?.x},${x?.y},${x?.z};`;
  return hashStringToInt(txt);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const CLASS_INDEX = Object.freeze(Object.fromEntries(SKY_CLASSES.map((c, i) => [c, i])));
const FILLER_CUM = (() => {
  const out = []; let acc = 0;
  for (const c of SKY_CLASSES) { acc += SKY_FILLER_SHARE[c]; out.push(acc); }
  out[out.length - 1] = 1;   // domknięcie sumy (zaokrąglenia udziałów)
  return out;
})();

/** Faza oddechu prawdziwego układu — z id (stała niezależnie od liczby gwiazd tła). */
function realPhase(id) {
  return (mixSeed((hashStringToInt(String(id)) ^ SKY_SALT) >>> 0) / 4294967296) * Math.PI * 2;
}

/**
 * Katalog nieba. Prawdziwe układy NAJPIERW (indeksy 0…R−1 — stałe przy zmianie liczby gwiazd tła), potem tło.
 * Brak galaktyki (brak tablicy albo pusta) ⇒ `null`: bez galaktyki nie ma nieba (D-GX-6).
 * @param {Array<{id,x,y,z,spectralType,luminosity}>} systems — `galaxyData.systems` (ly, osie galaktyki)
 * @param {number} seed — ziarno galaktyki (`skySeedOf(galaxyData)`)
 * @param {{fillerCount?: number}} [opts]
 */
export function buildSkyCatalog(systems, seed, { fillerCount = LIVE_SKY.FILLER_COUNT } = {}) {
  if (!Array.isArray(systems) || systems.length === 0) return null;
  const real = systems.filter((s) => s && s.id != null && Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y)));
  if (real.length === 0) return null;
  const R = real.length;
  const F = Math.max(0, Math.floor(Number(fillerCount) || 0));
  const N = R + F;
  const pos = new Float64Array(N * 3), lum = new Float64Array(N);
  const cls = new Uint8Array(N), isReal = new Uint8Array(N), phase = new Float32Array(N);
  const ids = new Array(N).fill(null);
  const index = new Map();
  for (let i = 0; i < R; i++) {
    const s = real[i];
    pos[i * 3] = Number(s.x); pos[i * 3 + 1] = Number(s.y); pos[i * 3 + 2] = Number(s.z) || 0;
    const c = CLASS_INDEX[s.spectralType] ?? CLASS_INDEX.G;
    cls[i] = c;
    const L = Number(s.luminosity);
    lum[i] = L > 0 ? L : (SKY_REAL_LUM_DEFAULT[s.spectralType] ?? 1.0);
    isReal[i] = 1;
    phase[i] = realPhase(s.id);
    ids[i] = String(s.id);
    index.set(String(s.id), i);
  }
  const rng = makeSkyRng(seed);
  const r3in = SKY_SHELL_LY.IN ** 3, r3out = SKY_SHELL_LY.OUT ** 3;
  for (let j = 0; j < F; j++) {
    const i = R + j;
    // ⚠ Kolejność i liczba rzutów jest kontraktem (SKY_DRAWS_PER_STAR) — patrz nagłówek.
    const uR = rng(), uT = rng(), uP = rng(), uC = rng(), uL = rng(), uF = rng();
    const r = Math.cbrt(r3in + uR * (r3out - r3in));        // rozkład objętościowy w powłoce
    const th = uT * Math.PI * 2;
    const cz = 2 * uP - 1, sz = Math.sqrt(Math.max(0, 1 - cz * cz));
    pos[i * 3] = r * sz * Math.cos(th); pos[i * 3 + 1] = r * sz * Math.sin(th); pos[i * 3 + 2] = r * cz;
    let c = 0; while (c < FILLER_CUM.length - 1 && uC > FILLER_CUM[c]) c++;
    cls[i] = c;
    lum[i] = SKY_FILLER_LUM[SKY_CLASSES[c]] * Math.pow(10, (uL * 2 - 1) * SKY_LUM_SCATTER_DEX);
    phase[i] = uF * Math.PI * 2;
  }
  return { seed: seed | 0, streamSeed: skyStreamSeed(seed), realCount: R, fillerCount: F, N, pos, lum, cls, isReal, phase, ids, index };
}

/** Bufory wyjścia `skyFrom` (Float32 — wprost do atrybutów geometrii). */
export function allocSkyBuffers(capacity) {
  const n = Math.max(0, capacity | 0);
  return {
    capacity: n, count: 0,
    dir: new Float32Array(n * 3), pos: new Float32Array(n * 3), color: new Float32Array(n * 3),
    intensity: new Float32Array(n), size: new Float32Array(n), phase: new Float32Array(n),
    real: new Float32Array(n), src: new Int32Array(n),
  };
}

/** Magnitudo pozorne strumienia L/d² [L☉/ly²]: m = −2,5·log10(F). Strumień ≤ 0 albo NaN ⇒ bardzo słaba gwiazda. */
export function magnitudeOf(flux) {
  const f = Number(flux);
  return -2.5 * Math.log10(f > 1e-30 ? f : 1e-30);
}

/** Intensywność HDR z magnitudo: liniowo w magnitudo od podłogi, miękki sufit KNEE → CAP (nigdy powyżej CAP). */
export function intensityFromMag(m, k = LIVE_SKY) {
  let x = k.I_MIN + k.SLOPE * (k.MAG_LIMIT - m);
  if (!(x > k.I_MIN)) x = k.I_MIN;                      // także NaN ⇒ podłoga
  if (x > k.KNEE) {
    const span = k.CAP - k.KNEE;
    x = span > 0 ? k.KNEE + span * (1 - Math.exp(-(x - k.KNEE) / span)) : k.KNEE;
  }
  return x < k.CAP ? x : k.CAP;
}

/** Rozmiar punktu [px] z intensywności — rośnie z jasnością, w granicach SIZE_MIN … SIZE_MIN + SIZE_GAIN. */
export function sizeFromIntensity(I, k = LIVE_SKY) {
  const t = clamp01((I - k.I_MIN) / Math.max(1e-6, k.CAP - k.I_MIN));
  return k.SIZE_MIN + k.SIZE_GAIN * Math.pow(t, k.SIZE_EXP);
}

/**
 * Intensywność PRAWDZIWEGO układu (korekta 1): prawo tła z jego sufitem (bez zmian) × 10^(0,4·REAL_BOOST_MAG), potem
 * WŁASNY miękki sufit od CAP do REAL_CAP. Boost 0 ⇒ dokładnie prawo tła (≤ CAP). Monotoniczna w boost, ≤ REAL_CAP.
 */
export function realIntensityFromMag(m, k = LIVE_SKY) {
  const base = intensityFromMag(m, k);
  const boost = Number(k.REAL_BOOST_MAG) || 0;
  let x = boost === 0 ? base : base * Math.pow(10, 0.4 * boost);
  const lo = k.CAP, hi = Math.max(k.REAL_CAP, k.CAP);
  if (x > lo) {
    const span = hi - lo;
    x = span > 0 ? lo + span * (1 - Math.exp(-(x - lo) / span)) : lo;
  }
  return x > k.I_MIN ? (x < hi ? x : hi) : k.I_MIN;
}

/** Rozmiar PRAWDZIWEGO układu: jak tło do CAP, ponad CAP zapas do REAL_SIZE_GAIN px (pełny przy REAL_CAP). */
export function realSizeFromIntensity(I, k = LIVE_SKY) {
  const base = sizeFromIntensity(I, k);
  if (!(I > k.CAP) || !(k.REAL_CAP > k.CAP)) return base;
  const t = clamp01((I - k.CAP) / (k.REAL_CAP - k.CAP));
  return base + k.REAL_SIZE_GAIN * Math.pow(t, k.SIZE_EXP);
}

/** Promień punktu na kopule [j. świata] z odległości [ly] — logarytmicznie w paśmie SKY_DOME_WU. */
export function domeRadius(distLy) {
  const t = clamp01(Math.log(Math.max(distLy, 1e-9) / SKY_DOME_LY.NEAR) / Math.log(SKY_DOME_LY.FAR / SKY_DOME_LY.NEAR));
  return SKY_DOME_WU.MIN + (SKY_DOME_WU.MAX - SKY_DOME_WU.MIN) * t;
}

/**
 * Niebo widziane z układu `systemId`: kierunki (jednostkowe, osie świata Three.js), położenia na kopule, kolor,
 * intensywność i rozmiar — aktywny układ POMINIĘTY (nie świeci sam sobie). Układ spoza katalogu ⇒ obserwator
 * w początku galaktyki (dom), bez pominięcia.
 * @returns {{count, observerId, observerFound, excluded, maxRealI, maxFillerI, maxRealFlux, maxFillerFlux, brightestRealId, truncated}}
 */
export function skyFrom(catalog, systemId, out, knobs = LIVE_SKY) {
  const res = {
    count: 0, observerId: systemId ?? null, observerFound: false, excluded: -1,
    maxRealI: 0, maxFillerI: 0, maxRealFlux: 0, maxFillerFlux: 0, brightestRealId: null, truncated: false,
  };
  if (!catalog || !out) { if (out) out.count = 0; return res; }
  const { N, pos, lum, cls, isReal, phase, ids, index } = catalog;
  const oi = index.has(String(systemId)) ? index.get(String(systemId)) : -1;
  res.observerFound = oi >= 0; res.excluded = oi;
  const ox = oi >= 0 ? pos[oi * 3] : 0, oy = oi >= 0 ? pos[oi * 3 + 1] : 0, oz = oi >= 0 ? pos[oi * 3 + 2] : 0;
  const cap = out.capacity;
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (i === oi) continue;
    const dx = pos[i * 3] - ox, dy = pos[i * 3 + 1] - oy, dz = pos[i * 3 + 2] - oz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (!(d2 > 1e-12)) continue;                         // ten sam punkt co obserwator — nie ma kierunku
    if (k >= cap) { res.truncated = true; break; }
    const d = Math.sqrt(d2);
    const flux = lum[i] / d2;
    const real = isReal[i] === 1;
    // ⚠ Korekta 1: wzmocnienie prawdziwych układów PO suficie tła (dawniej przed nim — wspólny sufit je połykał).
    const m = magnitudeOf(flux);
    const I = real ? realIntensityFromMag(m, knobs) : intensityFromMag(m, knobs);
    const s = real ? realSizeFromIntensity(I, knobs) : sizeFromIntensity(I, knobs);
    const r = domeRadius(d);
    // osie galaktyki → osie świata: X = gx, Y = gz, Z = gy
    const wx = dx / d, wy = dz / d, wz = dy / d;
    const b3 = k * 3;
    out.dir[b3] = wx; out.dir[b3 + 1] = wy; out.dir[b3 + 2] = wz;
    out.pos[b3] = wx * r; out.pos[b3 + 1] = wy * r; out.pos[b3 + 2] = wz * r;
    const rgb = SKY_CLASS_RGB[SKY_CLASSES[cls[i]]];
    out.color[b3] = rgb[0]; out.color[b3 + 1] = rgb[1]; out.color[b3 + 2] = rgb[2];
    out.intensity[k] = I; out.size[k] = s; out.phase[k] = phase[i]; out.real[k] = real ? 1 : 0; out.src[k] = i;
    if (real) {
      if (I > res.maxRealI) { res.maxRealI = I; res.brightestRealId = ids[i]; }
      if (flux > res.maxRealFlux) res.maxRealFlux = flux;
    } else {
      if (I > res.maxFillerI) res.maxFillerI = I;
      if (flux > res.maxFillerFlux) res.maxFillerFlux = flux;
    }
    k++;
  }
  out.count = k; res.count = k;
  // Liczba prawdziwych układów jaśniejszych od najjaśniejszej gwiazdy tła (odczyt bramki: działa wzmocnienie?).
  let above = 0;
  for (let j = 0; j < k; j++) if (out.real[j] === 1 && out.intensity[j] > res.maxFillerI) above++;
  res.realsAboveMaxFiller = above;
  return res;
}

/** Migawka pokręteł (do porównania co klatkę w rendererze). */
export function skyKnobSnapshot(k = LIVE_SKY) { return { ...k }; }

/** Czy pokrętła różnią się od migawki; `rebuild` = zmieniła się liczba gwiazd tła (przebudowa katalogu). */
export function skyKnobsChanged(snap, k = LIVE_SKY) {
  if (!snap) return { changed: true, rebuild: true };
  let changed = false;
  for (const key of Object.keys(k)) if (snap[key] !== k[key]) { changed = true; break; }
  return { changed, rebuild: changed && snap.FILLER_COUNT !== k.FILLER_COUNT };
}

// ── Przyrządy bramki NIEBO (korekta 1): KOSMOS.debug.skyLookHome / skyLookAt / skyMarks — rachunek czysty, pod node ─
// ⚠ Debug, nie funkcja gry; los w G5 (zostają debugiem albo stają się etykietami nieba — opcja O1 planu).

/** Prawdziwe układy wg odległości od `systemId` (bez niego): [{ index, id, distLy }]; 1. = najbliższy. */
export function nearestRealSystems(catalog, systemId) {
  if (!catalog) return [];
  const oi = catalog.index.has(String(systemId)) ? catalog.index.get(String(systemId)) : -1;
  const p = catalog.pos;
  const ox = oi >= 0 ? p[oi * 3] : 0, oy = oi >= 0 ? p[oi * 3 + 1] : 0, oz = oi >= 0 ? p[oi * 3 + 2] : 0;
  const list = [];
  for (let i = 0; i < catalog.realCount; i++) {
    if (i === oi) continue;
    const d = Math.hypot(p[i * 3] - ox, p[i * 3 + 1] - oy, p[i * 3 + 2] - oz);
    if (d > 1e-6) list.push({ index: i, id: catalog.ids[i], distLy: d });
  }
  return list.sort((a, b) => a.distLy - b.distLy || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Kierunek (jednostkowy, osie świata: X = gx, Y = gz, Z = gy) z układu `fromId` do pozycji katalogu `index`. */
export function skyDirectionTo(catalog, fromId, index) {
  if (!catalog || !(index >= 0 && index < catalog.N)) return null;
  const oi = catalog.index.has(String(fromId)) ? catalog.index.get(String(fromId)) : -1;
  const p = catalog.pos;
  const dx = p[index * 3] - (oi >= 0 ? p[oi * 3] : 0);
  const dy = p[index * 3 + 1] - (oi >= 0 ? p[oi * 3 + 1] : 0);
  const dz = p[index * 3 + 2] - (oi >= 0 ? p[oi * 3 + 2] : 0);
  const d = Math.hypot(dx, dy, dz);
  return d > 1e-9 ? { x: dx / d, y: dz / d, z: dy / d, distLy: d } : null;
}

// Granice φ kontrolera kamery (przeciąganie, ThreeCameraController) i domyślne przesunięcie celu nad środek kadru:
// środek kadru zajmuje cel kamery (gwiazda układu po Home), więc gwiazda nieba stoi NAD nią, nie za jej tarczą.
export const SKY_LOOK = Object.freeze({ PHI_MIN: 0.1, PHI_MAX: Math.PI * 0.9, OFFSET_RAD: 0.2 });

/**
 * Kąty orbity kamery w konwencji ThreeCameraController (kamera = cel + d·(sinφ cosθ, cosφ, sinφ sinθ), patrzy na cel)
 * ustawiające kierunek `dir` dokładnie `offsetRad` NAD środkiem kadru (ta sama płaszczyzna pionowa — bez przechyłu).
 * φ przycięte do granic kontrolera ⇒ `clamped` i rzeczywiste przesunięcie w `offsetRad`.
 */
export function lookAnglesFor(dir, offsetRad = SKY_LOOK.OFFSET_RAD) {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const uy = Math.max(-1, Math.min(1, dir.y / len));
  const elevU = Math.asin(uy), az = Math.atan2(dir.z / len, dir.x / len);
  let phi = Math.PI / 2 + (elevU - offsetRad);          // φ = π/2 + elewacja kierunku widoku
  let clamped = false;
  if (phi < SKY_LOOK.PHI_MIN) { phi = SKY_LOOK.PHI_MIN; clamped = true; }
  else if (phi > SKY_LOOK.PHI_MAX) { phi = SKY_LOOK.PHI_MAX; clamped = true; }
  return { theta: az + Math.PI, phi, clamped, offsetRad: elevU - (phi - Math.PI / 2) };
}

/** Odległość „x,x ly" w liniach konsoli przyrządów bramki (przecinek dziesiętny — gra po polsku). Etykiety nieba
 *  na ekranie (warstwa HUD) — `fleet.clusterDistance` z separatorem języka. */
export function formatLy(d) { return `${(Number(d) || 0).toFixed(1).replace('.', ',')} ly`; }
