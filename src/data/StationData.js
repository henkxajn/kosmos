// StationData — definicje stacji orbitalnych (oddzielone od logiki, jak BuildingsData/ShipsData).
// S3.3b-S2: tier 1 = baza bez modułów. Koszt FINAL (Filip).
// Dokowanie/depot/tech-gate/UI = S3.3b-S3/S4 (fuelStore/fuelCapacity to placeholdery na encji).

export const STATIONS = {
  orbital_station: {
    id:     'orbital_station',
    namePL: 'Stacja orbitalna',
    nameEN: 'Orbital Station',
    tier:   1,
    requires: 'orbital_construction',   // bramka tech (S3.3b-S4): wymaga Konstrukcji Orbitalnej
    // Surowce bazowe i commodities są w TYM SAMYM inventory kolonii (ResourceSystem) —
    // rozdzielone tylko dla czytelności/UI; stationTotalCost() scala do jednego obiektu.
    cost: {
      Fe: 2500, Ti: 600, Cu: 600, Si: 400,
    },
    commodityCost: {
      structural_alloys:  250,
      reactive_armor:     150,
      electronic_systems: 120,
      conductor_bundles:  100,
      pressure_modules:   60,
      power_cells:        50,
      plasma_cores:       40,
    },
    // Wariant A (S3.3b-S2): materializacja NATYCHMIASTOWA po spend (canAfford → spend → stacja
    // od razu) — brak fazy budowy stacji jako całości. Progresja czasowa dotyczy MODUŁÓW
    // (StationModuleData.buildTime, tykane w StationSystem._tick), nie samej stacji.
    // (S3.4 FAZA 6 — usunięto martwe pole `buildTime:7`, nigdy nietykane; tier 2+ poza zakresem.)
    maxModules: 8,  // S3.4 FAZA 1 — limit slotów modułów (tier 1); patrz StationModuleData.js
  },
};

// Płaski koszt do spend()/canAfford() — commodities + surowce bazowe w jednym obiekcie.
export function stationTotalCost(stationType = 'orbital_station') {
  const d = STATIONS[stationType] ?? STATIONS.orbital_station;
  return { ...(d.cost ?? {}), ...(d.commodityCost ?? {}) };
}
