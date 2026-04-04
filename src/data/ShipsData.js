// ShipsData — definicje kadłubów statków kosmicznych (system modułowy)
//
// Statki budowane są w Stoczni (shipyard) i trafiają do hangaru (fleet) kolonii.
// Gracz wybiera kadłub + moduły z ShipModulesData.js w panelu projektowania.
//
// SYSTEM:
//   cost:              { Fe: 100, Ti: 30 } — surowce z inventory (kadłub)
//   commodityCost:     { reactive_armor: 5 } — towary z inventory (kadłub)
//   baseModuleSlots:   max ilość modułów do zainstalowania
//   baseFuelCapacity:  bazowa pojemność paliwa (przed modułami)
//   baseSpeedAU:       bazowa prędkość AU/rok (przed modułami)
//   baseCargoCapacity: bazowa ładowność ton (przed modułami)
//   defaultModules:    domyślne moduły (sugerowane przy pierwszym otwarciu)
//
// Finalne statystyki = baza kadłuba + suma efektów modułów
// (obliczane przez calcShipStats() z ShipModulesData.js)

export const SHIPS = {

  // ══════════════════════════════════════════════════════════════════════════
  // Kadłub Naukowy — lekki, 4 sloty modułowe
  // ══════════════════════════════════════════════════════════════════════════

  science_vessel: {
    id:                'science_vessel',
    namePL:            'Kadłub Naukowy',
    nameEN:            'Science Hull',
    icon:              '🛸',
    hullType:          'science',
    generation:        1,
    baseMass:          30,    // tony — lekki kadłub
    baseModuleSlots:   4,
    baseFuelCapacity:  8,
    baseSpeedAU:       1.3,
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.4,
    // Aliasy kompatybilności (stary kod czyta te pola z SHIPS[shipId])
    fuelCapacity:      8,
    fuelPerAU:         0.4,
    range:             20,
    speedAU:           1.3,
    cargoCapacity:     0,
    fuelType:          'power_cells',
    cost:              { Fe: 80, Ti: 15, Cu: 10 },
    commodityCost:     { structural_alloys: 4, polymer_composites: 3, electronic_systems: 2 },
    buildTime:         1,
    crewCost:          0.1,
    crewStrata:        'scientist',
    requires:          'exploration',
    defaultModules:    ['engine_chemical', 'science_lab', 'science_away_team'],
    capabilities:      ['recon', 'survey', 'deep_scan'],
    description:       'Lekki kadłub naukowy — 4 sloty modułowe. ' +
                       'Dobierz napęd i skaner stosownie do misji.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Kadłub Transportowy — ciężki, 6 slotów modułowych
  // ══════════════════════════════════════════════════════════════════════════

  cargo_ship: {
    id:                'cargo_ship',
    namePL:            'Kadłub Transportowy',
    nameEN:            'Cargo Hull',
    icon:              '📦',
    hullType:          'transport',
    generation:        1,
    baseMass:          60,    // tony — ciężki kadłub
    baseModuleSlots:   6,
    baseFuelCapacity:  10,
    baseSpeedAU:       1.0,
    baseCargoCapacity: 0,    // cargo wyłącznie z modułów
    baseFuelPerAU:     0.5,
    // Aliasy kompatybilności (stary kod czyta te pola z SHIPS[shipId])
    fuelCapacity:      10,
    fuelPerAU:         0.5,
    range:             20,
    speedAU:           1.0,
    cargoCapacity:     500,  // domyślne z defaultModules (2× cargo_small)
    fuelType:          'power_cells',
    cost:              { Fe: 120, Ti: 20, Cu: 10 },
    commodityCost:     { structural_alloys: 8, polymer_composites: 4, reactive_armor: 3 },
    buildTime:         0.5,
    crewCost:          0.05,
    crewStrata:        'worker',
    requires:          'exploration',
    defaultModules:    ['engine_chemical', 'cargo_small', 'cargo_small'],
    capabilities:      ['cargo'],
    description:       'Ciężki kadłub transportowy — 6 slotów modułowych. ' +
                       'Ładowność zależy od modułów cargo.',
  },

};
