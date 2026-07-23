// LaunchFuelCost — mnożnik paliwa STARTU wg pasma grawitacji ciała-źródła (Reforma, Etap 4).
//
// Studnia grawitacyjna: start z ciała NAZIEMNEGO kosztuje paliwo wg pasma grawitacji
// (płytka studnia = taniej, głęboka = drożej). Start z ORBITY (stacja) ani z otwartej
// przestrzeni NIE ma studni do pokonania → zawsze ×1.0. Wariant A stacji: stacja jest
// zwolniona ZAWSZE, niezależnie od grawitacji ciała pod nią (intuicja „już uciekłeś ze studni").
//
// Progi pasm: EnvironmentBands (JEDNO źródło prawdy — bez duplikowania literałów; te same
// pasma co EnvironmentCost/ProsperitySystem: low <0.4g / normal 0.4–1.5g / high >1.5g).
//
// Fail-open (wzór EnvironmentCost.envMultiplier + bramek Farma/Studnia z Etapu 1/2): brak
// ciała-źródła, nieznana grawitacja lub cokolwiek nieoczekiwanego → ×1.0. Nigdy nie blokuje
// startu, nie rzuca, nie sięga po inny default — jak `planet == null → mnożnik 1` w reszcie reformy.

import { gravityBand } from './EnvironmentBands.js';

// Mnożnik paliwa startu per pasmo grawitacji (start z powierzchni).
// normal = neutralny (×1.0), spójnie z GRAVITY_SURCHARGE w EnvironmentCost.
// Wartości startowe (strojalne, NIE finalne) z projektu reformy.
export const LAUNCH_FUEL_GRAVITY_MULT = { low: 0.7, normal: 1.0, high: 1.5 };

// Mnożnik dla ciała-źródła startu.
//   originBody null/undefined      → 1  (nie znamy źródła — fail-open)
//   originBody.type === 'station'  → 1  (start z orbity — brak studni grawitacyjnej, Wariant A)
//   inaczej                        → LAUNCH_FUEL_GRAVITY_MULT[gravityBand(surfaceGravity)]
//                                    (gravityBand(null) = 'normal' → ×1.0, więc ciało bez
//                                     grawitacji też jest bezpiecznie neutralne)
export function launchFuelGravityMult(originBody) {
  if (!originBody) return 1;
  if (originBody.type === 'station') return 1;
  return LAUNCH_FUEL_GRAVITY_MULT[gravityBand(originBody.surfaceGravity)] ?? 1;
}
