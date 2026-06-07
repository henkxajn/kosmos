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
    // PLACEHOLDER pod S3.3b-S3/S4 (przyszła faza budowy). W S3.3b-S2 (Wariant A) pole jest
    // NIEUŻYWANE — materializacja jest natychmiastowa po spend (canAfford → spend → stacja
    // od razu). Zostaje w danych, by przyszły slice mógł włączyć progresję bez zmiany schematu.
    buildTime: 7,   // lat gry (~6–8) — obecnie nietykany (instant materialize)
  },
};

// Płaski koszt do spend()/canAfford() — commodities + surowce bazowe w jednym obiekcie.
export function stationTotalCost(stationType = 'orbital_station') {
  const d = STATIONS[stationType] ?? STATIONS.orbital_station;
  return { ...(d.cost ?? {}), ...(d.commodityCost ?? {}) };
}
