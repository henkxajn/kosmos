// KOSMOS — CS-PHYS-a (D-CS-19, plan COLONY_SPHERE §3.8): realistyczny klimat ciał przy generacji (czyste funkcje).
//
// Model świata `climateModel` zapada RAZ przy tworzeniu świata (stempel `galaxyData.climateModel = 2`, jak D-CS-18):
//   1 = dotychczasowy (stała cieplarnia wg klasy atmosfery), 2 = ten moduł. Stary zapis bez stempla = 1 na zawsze.
// Zero rzutów RNG: wszystko liczone z wartości już wylosowanych przez generator (orbita, typ, atmosfera, albedo).
//
// Wzory (jednostki: K, S⊕ = strumień Ziemi, W/m²):
//   T_eq = 278 K · (1−A)^¼ · L^¼ / √a                        — bez zmian (SystemGenerator.calcEquilibriumTemp)
//   T_s  = T_eq · (1 + ¾·τ)^¼                                 — szara atmosfera, τ = głębokość optyczna (atm, S)
//   τ(S ≥ S_col): thin 0.1 · breathable 0.478·S^−1.70 (termostat węglanowo-krzemianowy) · dense 7 · thick 14,
//                 dense/thick + ucieczka cieplarniana smoothstep(1.1 → 1.5) do 33 / 40 (Wenus)
//   τ(S < S_col): floor + (τ(S_col) − floor)·(S/S_col)^8      — kondensacja CO₂ za granicą maks. cieplarni
//   bez atmosfery: dzień = √2·T_eq przy strumieniu peryhelium, noc = min(95 K, 0.75·T_eq) — TYLKO do wyświetlania
//   księżyce gazowych olbrzymów: T = (T_s⁴ + F/σ)^¼, F wg strefy (inner 2.5 W/m² Io, mid 0.05 Europa, outer 0)

import { FLUX_HOT, FLUX_WARM, FLUX_HZ_OUTER } from '../data/BodyArchetypes.js';
import { moonZoneOfRank } from './BodyArchetypeLogic.js';

export const CLIMATE_LEGACY = 1;
export const CLIMATE_V2     = 2;

export const KELVIN = 273.15;
export const STEFAN_BOLTZMANN = 5.670374e-8;     // W/(m²·K⁴)
export const EQ_TEMP_CONST_K  = 278;             // K — T_eq ciała czarnego przy 1 S⊕ i pełnej redystrybucji

// Granica kondensacji CO₂ = zewnętrzna krawędź HZ (ta sama stała dzieli hothouse / cryo_haze w archetypach)
export const FLUX_CO2_COLLAPSE   = FLUX_HZ_OUTER;   // S⊕
export const CO2_COLLAPSE_EXP    = 8;               // ostrość zapadania (bezwymiarowe)
// Ucieczka cieplarniana gęstych atmosfer: wilgotna cieplarnia od FLUX_WARM, pełna od FLUX_HOT
export const FLUX_RUNAWAY_START  = FLUX_WARM;       // S⊕
export const FLUX_RUNAWAY_FULL   = FLUX_HOT;        // S⊕

// Głębokość optyczna τ (bezwymiarowa) per klasa atmosfery. `tau` = przy S ≥ S_col, `runaway` = po ucieczce,
// `floor` = resztka po zapadnięciu CO₂ (N₂/CH₄ jak Tytan), breathable: `tau` przy 1 S⊕ i wykładnik termostatu.
export const ATMOSPHERE_TAU = Object.freeze({
  thin:       Object.freeze({ tau: 0.1,   floor: 0.05 }),
  breathable: Object.freeze({ tau: 0.478, thermostatExp: 1.70, floor: 0.3 }),
  dense:      Object.freeze({ tau: 7,     runaway: 33, floor: 1.7 }),
  thick:      Object.freeze({ tau: 14,    runaway: 40, floor: 2.5 }),
});

// Zakres dzień/noc ciał bez atmosfery (wyświetlanie)
export const SUBSOLAR_FACTOR       = Math.SQRT2;    // T_podsłoneczna / T_eq (brak redystrybucji ciepła)
export const NIGHT_FLOOR_K         = 95;            // K — noc regolitu wolno obracającego się ciała (Księżyc, Merkury)
export const NIGHT_EQ_RATIO        = 0.75;          // noc ciał dalekich (T_eq < ~127 K)
export const THIN_RANGE_DAMPING    = 0.5;           // cienka atmosfera: połowa amplitudy (Mars)

// Grzanie pływowe + podczerwień rodzica dla księżyców GAZOWYCH olbrzymów, wg strefy rangi (W/m²)
export const TIDAL_FLUX_W_M2 = Object.freeze({ inner: 2.5, mid: 0.05, outer: 0 });

const round2 = (x) => Math.round(x * 100) / 100;

/** Stempel modelu klimatu świata: 2 tylko przy jawnym stemplu, inaczej 1 (stary zapis / świat dotychczasowy). */
export function climateModelOfWorld(galaxyData) {
  return galaxyData?.climateModel === CLIMATE_V2 ? CLIMATE_V2 : CLIMATE_LEGACY;
}

/** Świat z klimatem zamrożonym przy generacji (LifeSystem nie przelicza temperatur). Fail-safe: brak stempla = nie. */
export function isFrozenClimateWorld(galaxyData) {
  return climateModelOfWorld(galaxyData) === CLIMATE_V2;
}

/** T_eq [K] — ten sam wzór co SystemGenerator.calcEquilibriumTemp. */
export function equilibriumK(L, a, albedo) {
  return EQ_TEMP_CONST_K * Math.pow(1 - albedo, 0.25) * Math.pow(L, 0.25) / Math.sqrt(a);
}

const smoothstep = (lo, hi, x) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

function tauAboveCollapse(p, atmosphere, S) {
  if (atmosphere === 'breathable') return p.tau * Math.pow(S, -p.thermostatExp);
  if (p.runaway != null) return p.tau + (p.runaway - p.tau) * smoothstep(FLUX_RUNAWAY_START, FLUX_RUNAWAY_FULL, S);
  return p.tau;
}

/** Głębokość optyczna τ atmosfery przy strumieniu S [S⊕]. Brak atmosfery / nieznana klasa → 0. */
export function opticalDepth(atmosphere, S) {
  const p = ATMOSPHERE_TAU[atmosphere];
  if (!p || !(S > 0)) return 0;
  if (S >= FLUX_CO2_COLLAPSE) return tauAboveCollapse(p, atmosphere, S);
  const tCol = tauAboveCollapse(p, atmosphere, FLUX_CO2_COLLAPSE);
  return p.floor + (tCol - p.floor) * Math.pow(S / FLUX_CO2_COLLAPSE, CO2_COLLAPSE_EXP);
}

/** Efekt cieplarniany ΔT [K] dla T_eq [K]. */
export function greenhouseK(atmosphere, S, eqK) {
  return eqK * (Math.pow(1 + 0.75 * opticalDepth(atmosphere, S), 0.25) - 1);
}

/** Zakres dzień/noc [K] ciała bez atmosfery (lub cienkiej — tłumiony do temperatury średniej `meanK`). */
export function dayNightRangeK({ L, a, e = 0, albedo, atmosphere, meanK }) {
  if (atmosphere !== 'none' && atmosphere !== 'thin') return null;
  const peri = a * (1 - Math.min(Math.max(e, 0), 0.99));
  const dayK   = SUBSOLAR_FACTOR * equilibriumK(L, peri, albedo);
  const eqK    = equilibriumK(L, a, albedo);
  const nightK = Math.min(NIGHT_FLOOR_K, NIGHT_EQ_RATIO * eqK);
  if (atmosphere === 'none') return { dayK: Math.max(dayK, meanK), nightK: Math.min(nightK, meanK) };
  return {
    dayK:   meanK + Math.max(0, dayK - meanK) * THIN_RANGE_DAMPING,
    nightK: meanK - Math.max(0, meanK - nightK) * THIN_RANGE_DAMPING,
  };
}

/**
 * Klimat ciała z atmosferą/bez (planeta, księżyc przed przejściem pływowym, planetoida) — rekord `climate` + T końcowa.
 * @param {{L:number, a:number, e?:number, albedo:number, atmosphere:string, fluxA?:number, greenhouse?:boolean,
 *          range?:boolean}} o — `fluxA` = półoś dla strumienia (księżyc: rodzica), `greenhouse:false` = planetoida,
 *          `range:false` = bez zakresu (gazowy olbrzym — brak powierzchni)
 * @returns {{temperatureC:number, climate:object}}
 */
export function bodyClimate({ L, a, e = 0, albedo, atmosphere, fluxA = a, greenhouse = true, range = true }) {
  const S   = L / (fluxA * fluxA);
  const eqK = equilibriumK(L, fluxA, albedo);
  const gK  = greenhouse ? greenhouseK(atmosphere, S, eqK) : 0;
  const tK  = eqK + gK;
  const r   = range ? dayNightRangeK({ L, a: fluxA, e, albedo, atmosphere: atmosphere ?? 'none', meanK: tK }) : null;
  return {
    temperatureC: tK - KELVIN,
    climate: {
      model: CLIMATE_V2,
      flux: Math.round(S * 1e6) / 1e6,      // S⊕ (6 miejsc — rekonstrukcja L = flux·a² dla świata macierzystego)
      eqC: round2(eqK - KELVIN),
      greenhouseC: round2(gK),
      tidalC: 0,
      dayMaxC: r ? round2(r.dayK - KELVIN) : null,
      nightMinC: r ? round2(r.nightK - KELVIN) : null,
    },
  };
}

/** Strumień grzania pływowego + IR rodzica [W/m²] dla księżyca o randze `rank` z `count` (rodzic gazowy). */
export function tidalFluxWm2(parentType, rank, count) {
  if (parentType !== 'gas') return 0;
  const zone = moonZoneOfRank(rank, count);
  return TIDAL_FLUX_W_M2[zone] ?? 0;
}

/**
 * Dolicz grzanie pływowe do księżyca z rekordem v2 (mutuje). T = (T⁴ + F/σ)^¼; noc ≥ (F/σ)^¼.
 * @returns {number} przyrost temperatury [K]
 */
export function applyTidalHeating(moon, fluxWm2) {
  const c = moon?.climate;
  if (!c || c.model !== CLIMATE_V2 || !(fluxWm2 > 0)) return 0;
  const tK  = moon.temperatureC + KELVIN;
  const add = fluxWm2 / STEFAN_BOLTZMANN;
  const nK  = Math.pow(tK ** 4 + add, 0.25);
  const dK  = nK - tK;
  moon.temperatureC = nK - KELVIN;
  moon.temperatureK = nK;
  if (moon.surface) moon.surface.temperature = moon.temperatureC;
  c.tidalC = round2(dK);
  if (c.nightMinC != null) {
    const floorK = Math.pow(add, 0.25);
    c.nightMinC = round2(Math.max(c.nightMinC + KELVIN, floorK) - KELVIN);
    c.dayMaxC   = round2(Math.pow((c.dayMaxC + KELVIN) ** 4 + add, 0.25) - KELVIN);
  }
  return dK;
}

/** Czy ciało z atmosferą/bez ma niespójność wygląd ↔ temperatura (reguła z §3.3.1, do sond i debug). */
export const LOOK_TEMP_CONTRADICTION = Object.freeze({
  terran:       T => T <= -10 || T >= 60,
  ocean:        T => T <= -10 || T >= 60,
  jungle:       T => T <= 10 || T >= 80,
  ice:          T => T > 0,
  cryo_haze:    T => T > 0,
  hothouse:     T => T < 50,
  scorched:     T => T < 50,
  icy_cracked:  T => T > 0,
  icy_cratered: T => T > 0,
  hazy_moon:    T => T >= 0,
});

export function lookContradicts(archetype, tempC) {
  const pred = LOOK_TEMP_CONTRADICTION[archetype];
  return !!pred && Number.isFinite(tempC) && pred(tempC);
}
