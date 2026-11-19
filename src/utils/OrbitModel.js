// KOSMOS — CS-PHYS-b (D-CS-19 część 2, plan COLONY_SPHERE §3.9): orbity skalowane jasnością gwiazdy (czyste funkcje).
//
// Model orbit świata `orbitModel` zapada RAZ przy tworzeniu świata (stempel `galaxyData.orbitModel = 2`, jak D-CS-18 /
// climateModel): 1 = dotychczasowy (HZ z tabeli klasy, minimalna orbita max(0.35, 0.15 + 0.4·M★), separacje stałe w AU),
// 2 = ten moduł. Stary zapis bez stempla = 1 na zawsze. Gwiazda świata 2 niesie własny stempel `star.orbitModel = 2`
// (zapisywany), z którego Star wyprowadza HZ przy każdym odczycie — bez zależności od kolejności wczytania galaktyki.
//
// Skala: ℓ = √L [AU] — odległość, na której strumień = 1 S⊕. Wszystkie odległości modelu 2 są wielokrotnościami ℓ:
//   HZ            = [0.85·ℓ, 1.70·ℓ]       — tabela klasy G (kalibracja Słońca: S 1.384 … 0.346 S⊕); tabela F zgadza
//                                            się z tym w 1.5%, K i M były rozciągnięte do środka (S 2.5 / 4.0) — hack
//                                            pod stałą minimalną orbitę, zbędny w tym modelu
//   linia mrozu   = 2.2 · hz.max = 3.74·ℓ  — ta sama proporcja co dotychczas (FLUX_FROST 0.072)
//   min. orbita   = max(0.03 AU, 0.40·ℓ)   — strumień 6.25 S⊕ (Merkury 6.7); podłoga dla najciemniejszych karłów M
//   ściśnięcie κ  = clamp(ℓ, 0.2, 1)       — mnożnik separacji planet (stabilność Hilla) i pasów małych ciał; jasne
//                                            gwiazdy (ℓ > 1) bez rozpychania (κ = 1, jak dotąd), podłoga 0.2 trzyma
//                                            księżyce skalistych planet wewnątrz połowy odstępu do sąsiada

import { CLIMATE_LEGACY, CLIMATE_V2, KELVIN, bodyClimate, equilibriumK } from './ClimateModel.js';

export const ORBIT_LEGACY = 1;
export const ORBIT_SCALED = 2;

export const HZ_INNER_AU_AT_1L     = 0.85;   // AU przy L = 1 L☉ (S = 1.384 S⊕)
export const HZ_OUTER_AU_AT_1L     = 1.70;   // AU przy L = 1 L☉ (S = 0.346 S⊕ — granica maks. cieplarni CO₂)
export const FROST_LINE_HZ_RATIO   = 2.2;    // linia mrozu / hz.max (bez zmian względem generatora)
export const MIN_ORBIT_AU_AT_1L    = 0.40;   // AU przy L = 1 L☉ (S = 6.25 S⊕)
export const MIN_ORBIT_FLOOR_AU    = 0.03;   // AU — podłoga minimalnej orbity
export const COMPACTION_MIN        = 0.2;    // podłoga κ (bezwymiarowe)
export const COMPACTION_MAX        = 1.0;    // sufit κ — jasne gwiazdy nie rozpychają układu

// Orbita domu (D-CS-19 decyzja 2 + CS-PHYS-b2): świat macierzysty KAŻDEGO imperium leży na orbicie, na której jego
// temperatura KOŃCOWA (po makeHomeworldBreathable: oddychalna atmosfera, model klimatu świata) wynosi +15 °C — środek
// pasma bezpieczeństwa 5–35 °C ma wtedy margines ±10 °C i clamp nie zadziała. W obu modelach klimatu taka orbita leży
// wewnątrz HZ (strumień ≈ 1.1–1.3 S⊕; wewnętrzna krawędź HZ = 1.384 S⊕).
export const HOMEWORLD_TARGET_C              = 15;    // °C — temperatura końcowa świata macierzystego
export const LEGACY_GREENHOUSE_BREATHABLE_C  = 20;    // °C — lustro SystemGenerator GREENHOUSE.breathable (keeper)
const HOME_SOLVE_A_MIN_L = 0.3;   // ℓ — dolna granica szukania orbity (poniżej min. orbity planet)
const HOME_SOLVE_A_MAX_L = 3.0;   // ℓ — górna granica szukania orbity (daleko za HZ)
const HOME_SOLVE_ITER    = 60;    // iteracje bisekcji (precyzja ≪ 1e-9 ℓ)

const ROCKY_ALBEDO_FALLBACK = 0.3;   // bezwymiarowe — albedo skalistej, gdy encja go nie niesie
const finiteL = (L) => (typeof L === 'number' && Number.isFinite(L) && L > 0) ? L : 1;

/** Model orbit świata: 2 tylko przy jawnym stemplu, inaczej 1 (stary zapis / świat dotychczasowy). */
export function orbitModelOfWorld(galaxyData) {
  return galaxyData?.orbitModel === ORBIT_SCALED ? ORBIT_SCALED : ORBIT_LEGACY;
}

/** ℓ = √L [AU]: odległość strumienia 1 S⊕. */
export function luminosityScaleAU(L) { return Math.sqrt(finiteL(L)); }

/** HZ modelu 2 [AU] z jasności gwiazdy [L☉]. */
export function scaledHabitableZone(L) {
  const l = luminosityScaleAU(L);
  return { min: HZ_INNER_AU_AT_1L * l, max: HZ_OUTER_AU_AT_1L * l };
}

/** Linia mrozu [AU] z HZ (oba modele — ta sama proporcja). */
export function frostLineAU(hz) { return (hz?.max ?? HZ_OUTER_AU_AT_1L) * FROST_LINE_HZ_RATIO; }

/** Minimalna orbita planety modelu 2 [AU]. */
export function scaledMinOrbitAU(L) {
  return Math.max(MIN_ORBIT_FLOOR_AU, MIN_ORBIT_AU_AT_1L * luminosityScaleAU(L));
}

/** κ — mnożnik separacji orbit i zakresów małych ciał modelu 2 (bezwymiarowy). */
export function compactionOf(L) {
  return Math.min(COMPACTION_MAX, Math.max(COMPACTION_MIN, luminosityScaleAU(L)));
}

/** Strefa orbity względem HZ i linii mrozu: 'inner' | 'hz' | 'outer' | 'frost' (poza linią mrozu). */
export function orbitZoneOf(a, hz) {
  if (!(a > 0) || !hz) return null;
  if (a < hz.min) return 'inner';
  if (a <= hz.max) return 'hz';
  if (a <= frostLineAU(hz)) return 'outer';
  return 'frost';
}

/**
 * Temperatura KOŃCOWA świata macierzystego na orbicie `a` [°C] — lustro makeHomeworldBreathable przed clampem:
 * model klimatu 2 → ClimateModel.bodyClimate z atmosferą oddychalną; inaczej T_eq + cieplarnia oddychalna (+20 °C).
 * @param {{L:number, a:number, e?:number, albedo:number, climateModel?:number}} o
 */
export function homeworldFinalTempC({ L, a, e = 0, albedo, climateModel = CLIMATE_LEGACY }) {
  const lum = finiteL(L);
  if (climateModel === CLIMATE_V2) return bodyClimate({ L: lum, a, e, albedo, atmosphere: 'breathable' }).temperatureC;
  return equilibriumK(lum, a, albedo) - KELVIN + LEGACY_GREENHOUSE_BREATHABLE_C;
}

/**
 * Orbita świata macierzystego [AU]: półoś, na której homeworldFinalTempC = +15 °C (bisekcja — temperatura maleje z
 * odległością), przycięta do HZ gwiazdy. Czysta funkcja, zero rzutów RNG.
 * @param {{L:number, e?:number, albedo:number, climateModel?:number, hz?:{min:number,max:number}}} o
 */
export function homeworldOrbitAU({ L, e = 0, albedo, climateModel = CLIMATE_LEGACY, hz = null }) {
  const l = luminosityScaleAU(L);
  let lo = HOME_SOLVE_A_MIN_L * l, hi = HOME_SOLVE_A_MAX_L * l;
  for (let i = 0; i < HOME_SOLVE_ITER; i++) {
    const mid = 0.5 * (lo + hi);
    if (homeworldFinalTempC({ L, a: mid, e, albedo, climateModel }) > HOMEWORLD_TARGET_C) lo = mid; else hi = mid;
  }
  const a = 0.5 * (lo + hi);
  return hz ? Math.min(hz.max, Math.max(hz.min, a)) : a;
}

/**
 * Świat macierzysty modelu 2 (D-CS-19 decyzja 2, CS-PHYS-b2): skalista planeta WEWNĄTRZ HZ gwiazdy, której temperatura
 * końcowa (homeworldFinalTempC, model klimatu z rekordu `climate` planety) jest najbliższa +15 °C; remis: mniejsza
 * półoś. Generator świata 2 stawia taką planetę dokładnie na orbicie +15 °C (SystemGenerator._placeHomeworldSlot), więc
 * reguła wskazuje właśnie ją. Brak skalistej w HZ → null (wołający bierze regułę dotychczasową). Ten sam wybór dla
 * gracza, bootstrapu AI i strażnika LifeSystem.
 * @param {Array} planets — encje planet układu
 * @param {{luminosity:number, habitableZone:{min:number,max:number}}} star
 */
export function pickHabitableHomeworld(planets, star) {
  const hz = star?.habitableZone;
  if (!Array.isArray(planets) || !hz) return null;
  const L = finiteL(star.luminosity);
  let best = null, bestKey = null;
  for (const p of planets) {
    const a = p?.orbital?.a;
    if (p?.planetType !== 'rocky' || !(a >= hz.min && a <= hz.max)) continue;
    const t = homeworldFinalTempC({ L, a, e: p.orbital.e ?? 0, albedo: p.albedo ?? ROCKY_ALBEDO_FALLBACK,
                                     climateModel: p.climate?.model === CLIMATE_V2 ? CLIMATE_V2 : CLIMATE_LEGACY });
    const key = [Math.abs(t - HOMEWORLD_TARGET_C), a];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = p; bestKey = key; }
  }
  return best;
}
