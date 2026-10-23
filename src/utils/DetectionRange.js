// DetectionRange — zasięg WYKRYCIA statku (AU): JEDNO źródło reguły dla detekcji par (`ProximitySystem._getDetectionRangeAU`
// — próg `vessel:proximityEnter`) i radaru warstwy HUD (granica pierścienia — ARKUSZ HUD H1, D-HUD-3, Finding 505).
// Reguła (M4 P3-7 + reforma detekcji): statek gracza — bazowy zasięg sensorów KADŁUBA (`VesselManager.getVesselSensorRangeAU`,
// per-kadłub `sensorRangeAU`, zapas 0,5 AU) × mnożnik techu `sensor_range` (`TechSystem.getMultiplier`); statek imperium —
// zasięg płaski `DETECTION_BASE_AU` (stan techu imperium nie jest śledzony — P5). Brak `VesselManager` / `TechSystem`
// (keeper headless bez `window.KOSMOS`) → baza / mnożnik 1.
// Czysty: bez `window` i bez EventBusa — systemy podaje wołający (wyciągnięte z `ProximitySystem` bez zmiany rachunku:
// te same działania w tej samej kolejności, wynik co do bitu).

/** Bazowy zasięg wykrycia (AU): statek imperium i zapas, gdy brak odczytu kadłuba. */
export const DETECTION_BASE_AU = 0.5;

/**
 * Zasięg wykrycia statku (AU).
 * @param {object} vessel
 * @param {{ vesselManager?: object|null, techSystem?: object|null }} [src] — `window.KOSMOS.vesselManager` / `.techSystem`
 * @returns {number}
 */
export function vesselDetectionRangeAU(vessel, { vesselManager = null, techSystem = null } = {}) {
  const isPlayer = (vessel.ownerEmpireId == null || vessel.ownerEmpireId === 'player');
  if (!isPlayer) return DETECTION_BASE_AU;
  const base = vesselManager?.getVesselSensorRangeAU ? vesselManager.getVesselSensorRangeAU(vessel) : DETECTION_BASE_AU;
  const mult = techSystem?.getMultiplier ? techSystem.getMultiplier('sensor_range') : 1.0;
  return base * mult;
}
