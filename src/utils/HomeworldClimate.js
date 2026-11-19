// KOSMOS — Finding 770: klimat świata macierzystego + gwiazda własnego układu (czyste funkcje, bez importów).
//
// LifeSystem co CHECK_INTERVAL lat gry przelicza temperaturę równowagową planet aktywnego układu. Przed poprawką
// liczył ją zawsze z gwiazdą DOMOWĄ i nadpisywał clamp z generacji (SystemGenerator.makeHomeworldBreathable
// trzyma świat macierzysty w paśmie 5–35 °C). Tu: wybór świata macierzystego (ta sama reguła co bootstrap AI)
// i strażnik pasma — przeliczenie nie może wypchnąć świata macierzystego poza pasmo z generacji.
// Wzoru temperatury NIE zmieniamy (to krok CS-PHYS / D-CS-19).

import { ORBIT_SCALED, pickHabitableHomeworld } from './OrbitModel.js';

// Pasmo clampu z generacji — lustro literałów w SystemGenerator.makeHomeworldBreathable (keeper pilnuje zgodności).
export const HOMEWORLD_TEMP_MIN_C = 5;    // °C — poniżej generator losuje 5–15 °C
export const HOMEWORLD_TEMP_MAX_C = 35;   // °C — powyżej generator losuje 20–30 °C

// Naprawa zapisu uszkodzonego przez stary błąd (temperatura już poza pasmem): środek pasma, które wylosowałby
// generator po tej samej stronie. Deterministycznie — symulacja nie zużywa strumienia Math.random.
export const HOMEWORLD_REPAIR_COLD_C = 10;   // °C — środek 5–15
export const HOMEWORLD_REPAIR_HOT_C  = 25;   // °C — środek 20–30

const inBand = (c) => Number.isFinite(c) && c >= HOMEWORLD_TEMP_MIN_C && c <= HOMEWORLD_TEMP_MAX_C;

/**
 * Świat macierzysty w liście planet układu — reguła bootstrapu AI (EmpireColonyBootstrap._pickHomePlanet):
 * pierwsza skalista, potem pierwsza nie-gazowa, na końcu pierwsza. Niezależna od własności kolonii
 * (zdobyty dom to dalej to samo ciało z tym samym clampem).
 */
export function pickHomeworldBody(planets, star = null) {
  if (!Array.isArray(planets) || planets.length === 0) return null;
  // CS-PHYS-b — gwiazda świata orbit skalowanych: skalista w HZ (lustro EmpireColonyBootstrap._pickHomePlanet)
  if (star?.orbitModel === ORBIT_SCALED) {
    const hz = pickHabitableHomeworld(planets, star);
    if (hz) return hz;
  }
  const rocky = planets.find(p => p?.planetType === 'rocky');
  if (rocky) return rocky;
  const nonGas = planets.find(p => p?.planetType !== 'gas');
  return nonGas ?? planets[0];
}

/**
 * Temperatura świata macierzystego po przeliczeniu [°C].
 *  - wynik wzoru w paśmie → wynik wzoru (dom bez clampu: to samo co generacja, z dokładnością do zaokrąglenia);
 *  - wynik poza pasmem, bieżąca w paśmie → bieżąca (clamp z generacji zostaje);
 *  - obie poza pasmem (zapis zepsuty starym błędem) → środek pasma generatora po stronie wyniku.
 * @param {number} computedC — temperatura ze wzoru równowagowego (gwiazda własnego układu) [°C]
 * @param {number} currentC  — temperatura zapisana na ciele [°C]
 */
export function guardHomeworldTempC(computedC, currentC) {
  if (inBand(computedC)) return computedC;
  if (inBand(currentC)) return currentC;
  const ref = Number.isFinite(computedC) ? computedC : currentC;
  return Number.isFinite(ref) && ref > HOMEWORLD_TEMP_MAX_C ? HOMEWORLD_REPAIR_HOT_C : HOMEWORLD_REPAIR_COLD_C;
}
