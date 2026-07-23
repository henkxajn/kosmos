// EnvironmentCost — wrażliwość kategorii budynków na środowisko planety (Stage 2).
// Dopłata środowiskowa do kosztu BUDOWY (pełna siła) i UTRZYMANIA (połowa) w zależności od
// grawitacji / atmosfery / temperatury planety TEJ kolonii. Progi pasm: EnvironmentBands
// (jedno źródło prawdy — bez duplikowania literałów).

import { gravityBand, temperatureBand } from './EnvironmentBands.js';

// Waga 0–1 per oś: jak mocno kategoria odczuwa dane środowisko (czym kategoria jest koncepcyjnie).
// UWAGA: `food` ma atmo/temp = 0 celowo — Farma ma WŁASNĄ bramkę klimatyczną + karę wydajności
// (Stage 1); nie nakładamy trzeciej kary. `civil` = budynki kulturowe/dziedzictwa.
export const ENVIRONMENT_SENSITIVITY = {
  population:     { gravity: 0.2, atmosphere: 1.0, temperature: 1.0 },
  mining:         { gravity: 1.0, atmosphere: 0.5, temperature: 0.0 },
  energy:         { gravity: 0.2, atmosphere: 0.3, temperature: 0.5 },
  food:           { gravity: 0.2, atmosphere: 0.0, temperature: 0.0 },
  research:       { gravity: 0.3, atmosphere: 0.6, temperature: 0.3 },
  space:          { gravity: 0.8, atmosphere: 0.4, temperature: 0.2 },
  military:       { gravity: 0.8, atmosphere: 0.3, temperature: 0.2 },
  market:         { gravity: 0.1, atmosphere: 0.1, temperature: 0.1 },
  infrastructure: { gravity: 0.3, atmosphere: 0.2, temperature: 0.2 },
  synthetic:      { gravity: 0.2, atmosphere: 0.1, temperature: 0.1 },
  governance:     { gravity: 0.2, atmosphere: 0.5, temperature: 0.4 },
  civil:          { gravity: 0.3, atmosphere: 0.3, temperature: 0.3 },
};

// Dopłaty per pasmo (frakcja doliczana do kosztu przy sensitivity=1).
export const GRAVITY_SURCHARGE     = { low: 0,    normal: 0,    high: 0.40 };
export const ATMOSPHERE_SURCHARGE  = { none: 0.50, thin: 0.20, breathable: 0, dense: 0.10 };
export const TEMPERATURE_SURCHARGE = { cold: 0.25, moderate: 0, hot: 0.15 };

// Mnożnik kosztu środowiskowego dla kategorii na danej planecie.
//   half=true → połowa siły (utrzymanie budynków).
//   Fail-open: brak planety → 1 (nigdy nie dopłaca na braku referencji; wzór Stage 1).
//   Nieznana atmosfera (np. legacy 'thick') → 0 dopłaty (?? 0).
export function envMultiplier(category, planet, { half = false } = {}) {
  if (!planet) return 1;
  const s = ENVIRONMENT_SENSITIVITY[category] ?? { gravity: 0, atmosphere: 0, temperature: 0 };
  const gSur = GRAVITY_SURCHARGE[gravityBand(planet.surfaceGravity)] ?? 0;
  const aSur = ATMOSPHERE_SURCHARGE[planet.atmosphere] ?? 0;
  const tSur = TEMPERATURE_SURCHARGE[temperatureBand(planet.temperatureC)] ?? 0;
  const total = s.gravity * gSur + s.atmosphere * aSur + s.temperature * tSur;
  return 1 + (half ? total / 2 : total);
}

// Koszt SUROWCÓW budowy z dopłatą środowiskową (pełna siła). JEDNO źródło prawdy dla _build
// (spend/afford) i podglądu w UI, żeby podgląd == rzeczywisty koszt dla części środowiskowej.
//   latBuildCost — modyfikator polarny (zna go tylko _build z kafelka; UI podaje domyślne 1).
//   Zaokrąglenie Math.ceil — spójne z dawnym _build.
export function computeBuildResourceCost(building, planet, latBuildCost = 1) {
  const mult = envMultiplier(building.category, planet);
  const out = {};
  for (const [k, v] of Object.entries(building.cost ?? {})) {
    out[k] = Math.ceil(v * latBuildCost * mult);
  }
  return out;
}
