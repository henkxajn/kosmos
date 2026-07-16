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
    sensorRangeAU:     2.5,    // AU — kadłub naukowy: szerokie sensory zwiadowcze (reforma detekcji)
    // Aliasy kompatybilności (stary kod czyta te pola z SHIPS[shipId])
    fuelCapacity:      8,
    fuelPerAU:         0.4,
    range:             20,
    speedAU:           1.3,
    cargoCapacity:     0,
    fuelType:          'fuel',
    cost:              { Fe: 80, Ti: 15, Cu: 10 },
    commodityCost:     { structural_alloys: 4, polymer_composites: 3, electronic_systems: 2 },
    upkeepCredits:     50,     // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         4.0,
    maxSurge:          1,
    crewCost:          0.1,
    crewStrata:        'scientist',
    requires:          'exploration',
    defaultModules:    ['engine_chemical', 'science_lab', 'science_away_team'],
    capabilities:      ['recon', 'survey', 'deep_scan'],
    description:       'Lekki kadłub naukowy — 4 sloty modułowe. ' +
                       'Dobierz napęd i skaner stosownie do misji.',
    descEN:            'Light science hull — 4 module slots. ' +
                       'Fit the drive and scanner to match the mission.',
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
    sensorRangeAU:     1.0,    // AU — transport: minimalne sensory (reforma detekcji)
    // Aliasy kompatybilności (stary kod czyta te pola z SHIPS[shipId])
    fuelCapacity:      10,
    fuelPerAU:         0.5,
    range:             20,
    speedAU:           1.0,
    cargoCapacity:     500,  // domyślne z defaultModules (2× cargo_small)
    fuelType:          'fuel',
    cost:              { Fe: 120, Ti: 20, Cu: 10 },
    commodityCost:     { structural_alloys: 8, polymer_composites: 4, reactive_armor: 3 },
    upkeepCredits:     300,    // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         3.0,
    maxSurge:          1,
    crewCost:          0.05,
    crewStrata:        'worker',
    requires:          'exploration',
    defaultModules:    ['engine_chemical', 'cargo_small', 'cargo_small'],
    capabilities:      ['cargo'],
    description:       'Ciężki kadłub transportowy — 6 slotów modułowych. ' +
                       'Ładowność zależy od modułów cargo.',
    descEN:            'Heavy transport hull — 6 module slots. ' +
                       'Cargo capacity depends on the cargo modules.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Statek Zaopatrzeniowy (Opcja C v3) — placeholder, fleet-group mechanika TBD
  // Magazyn military_supplies, zaopatruje statki bojowe w tej samej grupie floty.
  // W v3: budowalny po fleet_logistics, ale aktywna mechanika supply w kosmosie
  // czeka na osobny projekt "Fleet Groups". Statek ma statystyki i ładowność,
  // ale nie wpływa jeszcze na walkę w kosmosie.
  // ══════════════════════════════════════════════════════════════════════════

  space_supply_ship: {
    id:                'space_supply_ship',
    namePL:            'Kadłub Zaopatrzeniowy',
    nameEN:            'Supply Hull',
    icon:              '🚚',
    hullType:          'logistics',
    generation:        1,
    baseMass:          80,
    baseModuleSlots:   5,
    baseFuelCapacity:  12,
    baseSpeedAU:       0.9,
    baseCargoCapacity: 0,
    baseFuelPerAU:     0.6,
    sensorRangeAU:     1.0,    // AU — zaopatrzeniowiec: minimalne sensory (reforma detekcji)
    // Aliasy kompatybilności
    fuelCapacity:      12,
    fuelPerAU:         0.6,
    range:             20,
    speedAU:           0.9,
    cargoCapacity:     500,
    fuelType:          'fuel',
    // Specyficzne dla supply ship
    supplyMagazine:      500,  // pojemność magazynu military_supplies
    supplyTransferRate:  20,   // supply/civY transferowane do sąsiednich statków fleet-group (placeholder)
    cost:              { Ti: 40, Si: 30, Hv: 10, Xe: 2 },
    commodityCost:     { structural_alloys: 15, electronic_systems: 8, power_cells: 5 },
    upkeepCredits:     300,    // Kr/rok — utrzymanie floty (S3.5a-1)
    buildTime:         4.0,
    maxSurge:          1,
    crewCost:          0.1,
    crewStrata:        'worker',
    requires:          'fleet_logistics',
    defaultModules:    ['engine_chemical', 'cargo_small', 'cargo_small'],
    capabilities:      ['cargo', 'fleet_supply'],
    // Opcja C v3 — stat bonuses dla mechaniki org/morale
    baseOrg:           20,
    baseMorale:        20,
    placeholder:       true,  // fleet-group supply broadcast w osobnym projekcie
    description:       'Mobilne zaopatrzenie flotowe. Przewozi zaopatrzenie dla statków bojowych. ' +
                       '[Placeholder: aktywna mechanika fleet-group w osobnym projekcie.]',
    descEN:            'Mobile fleet resupply. Carries provisions for combat vessels. ' +
                       '[Placeholder: active fleet-group mechanics in a separate project.]',
  },

};
