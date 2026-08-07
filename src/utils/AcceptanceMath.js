// AcceptanceMath — czysta matematyka Acceptance Engine (WOJNA I POKÓJ 1.0, D2, E1).
//
// ZERO stanu, ZERO efektów ubocznych, ZERO gameState/EventBus/DOM — moduł da się
// odpalić w gołym Node (smoke: src/testing/smoke/acceptance_engine_smoke.mjs).
// Wzór: src/utils/OpinionMath.js z D1 (czyste funkcje + katalog wstrzykiwany argumentem).
//
// Podział odpowiedzialności fazy D2:
//   AcceptanceWeightData.js  → dane (termy, wagi, progi, nadpisania)
//   AcceptanceMath.js        → matematyka (TEN plik)
//   AcceptanceEngine.js      → ewaluatory termów + budowa kontekstu z window.KOSMOS
//
// Katalog termów jest WSTRZYKIWANY tam, gdzie potrzebny (buildAcceptanceBreakdown) —
// testy podają własny. Z danych importujemy wyłącznie stałe skali, żeby te same liczby
// nie żyły w dwóch miejscach.

import {
  OFFER_HALF_KR, COUNTER_HINT_MAX_GAP, COUNTER_HINT_KR_STEP,
} from '../data/AcceptanceWeightData.js';

// ── Skala ───────────────────────────────────────────────────────────────────

/** Każdy term zwraca raw w −1..+1; clamp jest kontraktem, nie uprzejmością. */
export function clampUnit(v) {
  const n = Number(v) || 0;
  return n < -1 ? -1 : (n > 1 ? 1 : n);
}

// Precyzja zaokrąglania wkładów i wyniku (6 miejsc po przecinku).
export const SCORE_PRECISION = 1e6;

/**
 * Zaokrąglenie wkładu/wyniku do 6 miejsc.
 *
 * ⚠ UCZCIWIE: dla DZISIEJSZYCH kotwic parytetu to NIE jest konieczne — sprawdzone
 * rachunkiem, `(0.3 − 0.5) × 2` daje w IEEE754 dokładnie 0.4 i wszystkie trzy granice
 * (28 / 24 / 43) wypadają co do cyfry. Zostaje z dwóch powodów, które są prawdziwe:
 *   1. wiersze rozbicia sumują się do wyniku CO DO CYFRY — panel odmowy i telemetria nie
 *      mogą pokazywać składników, które nie dodają się do pokazanego wyniku;
 *   2. E2 przestraja wagi z macierzą w ręku i trafi na liczby, które szczęścia z 0.4 mieć
 *      nie będą; decyzja przewracająca się na 1e-15 to paskudna klasa błędu, a ubezpieczenie
 *      kosztuje jedno mnożenie. Dzięki temu macierz z E7 jest też powtarzalna między maszynami.
 */
export function roundScore(v) {
  return Math.round((Number(v) || 0) * SCORE_PRECISION) / SCORE_PRECISION;
}

/**
 * Malejące przyrosty: 0 → 0, OFFER_HALF_KR → 0.5, ∞ → 1.
 * Używane przez term `offer` (podwojenie łapówki NIE podwaja efektu).
 */
export function diminishingReturns(value, halfScale = OFFER_HALF_KR) {
  const v = Math.max(0, Number(value) || 0);
  const s = Math.max(1e-9, Number(halfScale) || 0);
  return 1 - Math.pow(0.5, v / s);
}

/** Odwrotność diminishingReturns — ile trzeba dać, żeby uzyskać `y` ∈ [0,1). */
export function inverseDiminishing(y, halfScale = OFFER_HALF_KR) {
  const t = Number(y) || 0;
  if (t <= 0) return 0;
  if (t >= 1) return Infinity;
  const s = Math.max(1e-9, Number(halfScale) || 0);
  return s * (Math.log(1 - t) / Math.log(0.5));
}

// ── PRNG dla szumu `erratic` ────────────────────────────────────────────────

/**
 * Finalizer splitmix32 — rozprasza STRUKTURALNE wejścia.
 *
 * ⚠ BLIŹNIAK: identyczna funkcja żyje prywatnie w `src/generators/EmpireGenerator.js`
 * (tam `mixSeed`, dodana w `0b15d95`). Świadomie NIE wyciągamy jej teraz do wspólnego
 * modułu: EmpireGenerator jest plikiem, na którym stoją piny GALAXY_SEED, a E1 ma stać
 * samodzielnie. Ekstrakcja należy do E5 — to ten commit i tak dotknie EmpireGeneratora
 * (rzut cechy `erratic`), więc scali oba wystąpienia jednym ruchem.
 *
 * Powód istnienia (lekcja z `0b15d95`): seedy bywają prawie kolejnymi liczbami, a
 * pierwszy rzut świeżego mulberry32 dla takich wejść jest słabo rozrzucony — kolizje
 * zdarzały się częściej niż losowo. Nigdy nie czytamy pierwszego rzutu surowego seeda.
 */
export function mixSeed(n) {
  let z = (Number(n) || 0) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/** Hash stringa do int32 — ten sam wariant, którego używa reszta projektu (djb2-ish). */
export function hashStringToInt(str) {
  const s = String(str ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Deterministyczny szum −1..+1 z ziarna. Rozgrzany: bierzemy WYJŚCIE finalizera,
 * a nie pierwszy rzut generatora zasianego surową liczbą (patrz mixSeed).
 */
export function noiseUnit(seed) {
  return (mixSeed(seed) / 4294967296) * 2 - 1;
}

// ── Wagi ────────────────────────────────────────────────────────────────────

/**
 * Składa wagi czasownika z nadpisaniami (archetyp, potem objective).
 * Nadpisanie `terms` to MNOŻNIK wagi bazowej; `thresholdDelta` dodaje się do progu.
 * Nadpisanie termu, którego czasownik nie używa, jest ignorowane (nie wprowadza termu
 * tylnymi drzwiami — inaczej archetyp mógłby po cichu dodać wymiar oceny).
 *
 * @param {Object} verbCfg    — wpis z VERB_ACCEPTANCE
 * @param {Array<Object|null>} overrides — kolejno stosowane { terms?, thresholdDelta? }
 * @returns {{ terms: Object, threshold: number }}
 */
export function resolveWeights(verbCfg, overrides = []) {
  const terms = { ...(verbCfg?.terms ?? {}) };
  let threshold = Number(verbCfg?.threshold) || 0;
  for (const ov of overrides) {
    if (!ov) continue;
    for (const [termId, mult] of Object.entries(ov.terms ?? {})) {
      if (!(termId in terms)) continue;
      terms[termId] = terms[termId] * (Number(mult) || 0);
    }
    threshold += Number(ov.thresholdDelta) || 0;
  }
  return { terms, threshold };
}

// ── Rozbicie i wynik ────────────────────────────────────────────────────────

/**
 * Rozbicie akceptacji do UI i telemetrii:
 * [{ term, labelKey, raw, weight, value, status }], posortowane malejąco po |value|
 * (remis → po id termu, żeby kolejność była stabilna).
 *
 * ZWRACA WSZYSTKIE termy czasownika, także te o wkładzie 0 — telemetria E7 musi widzieć
 * kolumnę bezczynną, żeby oznaczyć ją jako BEZCZYNNĄ. Filtrowanie do oczu gracza robi
 * `visibleBreakdown` (wiersz o wartości 0 nic nie mówi, a sugeruje działającą mechanikę).
 * Nieznany term degraduje się do surowego id — brak etykiety nie może wywalić panelu.
 *
 * @param {Object} rawByTerm — { termId: raw ∈ −1..+1 }
 * @param {Object} weights   — { termId: waga w punktach }
 * @param {Object} catalog   — wstrzyknięty ACCEPTANCE_TERMS (albo atrapa w teście)
 */
export function buildAcceptanceBreakdown(rawByTerm = {}, weights = {}, catalog = {}) {
  return Object.entries(weights)
    .map(([term, weight]) => {
      const raw = clampUnit(rawByTerm[term]);
      const w   = Number(weight) || 0;
      return {
        term,
        labelKey: catalog[term]?.labelKey ?? term,
        status:   catalog[term]?.status ?? 'live',
        raw,
        weight:   w,
        value:    roundScore(raw * w),
      };
    })
    .sort((x, y) => (Math.abs(y.value) - Math.abs(x.value)) || String(x.term).localeCompare(String(y.term)));
}

/** Wiersze warte pokazania graczowi — bez zerowych wkładów (K-2/K-5: nie udajemy mechaniki). */
export function visibleBreakdown(rows = []) {
  return rows.filter(r => (Number(r?.value) || 0) !== 0);
}

/** Σ wkładów. Osobno od budowy rozbicia, żeby wynik i to, co widać, NIE mogły się rozjechać. */
export function sumScore(rows = []) {
  let sum = 0;
  for (const r of rows) sum += (Number(r?.value) || 0);
  return roundScore(sum);
}

/** Decyzja: wynik ≥ próg. Jedno miejsce, żeby nikt nie napisał `>` w drugim. */
export function decide(score, threshold) {
  return (Number(score) || 0) >= (Number(threshold) || 0);
}

/**
 * Podpowiedź kontroferty — ILE kredytów zamknęłoby lukę do progu.
 * Emitowana od E1, świadomie BEZ konsumenta (UI kontrofert jest poza 1.0, backbone §0).
 *
 * Zwraca null gdy: propozycja przeszła, czasownik nie ma termu `offer`, luka przekracza
 * COUNTER_HINT_MAX_GAP (odmowa merytoryczna — sugerowanie łapówki byłoby kłamstwem),
 * albo gdy łapówka nie domknie luki nawet w nieskończoności (waga < luka).
 */
export function counterHintFor(score, threshold, weights = {}, { offerAlready = 0, halfScale = OFFER_HALF_KR } = {}) {
  const gap = (Number(threshold) || 0) - (Number(score) || 0);
  if (gap <= 0) return null;
  if (gap > COUNTER_HINT_MAX_GAP) return null;
  const offerWeight = Number(weights.offer) || 0;
  if (offerWeight <= 0) return null;

  // Ile raw termu `offer` domknęłoby lukę — i ile to kredytów łącznie.
  const neededRaw = gap / offerWeight;
  if (neededRaw >= 1) return null;                        // nieosiągalne żadną kwotą
  const alreadyRaw = diminishingReturns(offerAlready, halfScale);
  const totalRaw   = alreadyRaw + neededRaw;
  if (totalRaw >= 1) return null;
  const totalKr = inverseDiminishing(totalRaw, halfScale);
  if (!Number.isFinite(totalKr)) return null;

  const delta   = Math.max(0, totalKr - (Number(offerAlready) || 0));
  const credits = Math.ceil(delta / COUNTER_HINT_KR_STEP) * COUNTER_HINT_KR_STEP;
  return credits > 0 ? { addOffer: { credits } } : null;
}
