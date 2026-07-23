// EnvironmentBands — JEDYNE źródło progów pasm środowiskowych (grawitacja, temperatura).
// Współdzielone przez ProsperitySystem (bramki popytu), ConsumerGoodsData (tabele mnożników)
// i EnvironmentCost (dopłaty do kosztu budowy/utrzymania). Zastępuje wcześniejsze duplikaty
// literałów (ProsperitySystem._getGravKey/_getTempKey + komentarze w ConsumerGoodsData).
//
// Nazwy pasm zgodne z kluczami tabel mnożników/dopłat: low|normal|high, cold|moderate|hot.

export const GRAVITY_THRESHOLDS = { LOW: 0.4, HIGH: 1.5 };   // g (ziemskich)
export const TEMP_THRESHOLDS    = { COLD: -53, HOT: 77 };    // °C

// null → 'normal' (zachowanie z ProsperitySystem — brak danych = neutralny)
export function gravityBand(surfaceGravity) {
  if (surfaceGravity == null) return 'normal';
  if (surfaceGravity < GRAVITY_THRESHOLDS.LOW)  return 'low';
  if (surfaceGravity > GRAVITY_THRESHOLDS.HIGH) return 'high';
  return 'normal';
}

// null → 'moderate' (zachowanie z ProsperitySystem)
export function temperatureBand(temperatureC) {
  if (temperatureC == null) return 'moderate';
  if (temperatureC > TEMP_THRESHOLDS.HOT)  return 'hot';
  if (temperatureC < TEMP_THRESHOLDS.COLD) return 'cold';
  return 'moderate';
}
