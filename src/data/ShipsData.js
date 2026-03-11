// ShipsData — definicje statków kosmicznych
//
// Statki budowane są w Stoczni (shipyard) i trafiają do hangaru (fleet) kolonii.
// Wymagane do ekspedycji naukowych, kolonizacyjnych i transportowych.
//
// SYSTEM (Etap 26+30):
//   cost:          { Fe: 100, Ti: 30 } — surowce z inventory
//   commodityCost: { hull_armor: 5 } — towary z inventory
//   cargoCapacity: tony — ile surowców może przewieźć statek
//   fuelCapacity:  max power_cells na pokładzie
//   fuelPerAU:     zużycie power_cells na 1 AU podróży
//   range:         obliczany: fuelCapacity / fuelPerAU (AU) — zachowany jako fallback

export const SHIPS = {
  science_vessel: {
    id:            'science_vessel',
    namePL:        'Statek Naukowy',
    icon:          '🛸',
    cost:          { Fe: 100, Ti: 20, Cu: 15 },
    commodityCost: { hull_armor: 4, electronics: 3, power_cells: 2, copper_wiring: 2 },
    buildTime:     1,
    fuelCapacity:  8,            // max power_cells
    fuelPerAU:     0.4,          // power_cells / AU → zasięg 20 AU
    range:         20,           // AU (fallback = fuelCapacity / fuelPerAU)
    speedAU:       1.2,          // AU/rok — zwiadowca (bazowa ×3)
    cargoCapacity: 0,            // brak ładowni — statek badawczy
    crewCost:      0.5,          // POP zablokowany przy budowie statku
    requires:      'exploration',
    description:   'Orbitalny statek badawczy. Wymagany do ekspedycji naukowych.',
  },

  colony_ship: {
    id:            'colony_ship',
    namePL:        'Statek Kolonijny',
    icon:          '🚢',
    cost:          { Fe: 200, Ti: 40, Cu: 20, Si: 20 },
    commodityCost: {
      hull_armor:        10,
      habitat_modules:    6,
      electronics:        5,
      power_cells:        4,
      water_recyclers:    3,
      food_synthesizers:  2,
    },
    buildTime:     3,
    fuelCapacity:  8,            // max power_cells
    fuelPerAU:     0.7,          // power_cells / AU → zasięg ~11.4 AU
    range:         12,           // AU (fallback)
    speedAU:       0.48,         // AU/rok — ciężki transportowiec kolonistów (bazowa ×3)
    cargoCapacity: 200,          // tony
    crewCost:      2.0,          // POPy zablokowane przy budowie statku
    requires:      'colonization',
    description:   'Transportuje kolonistów na nowe ciało. Zużywany przy wysłaniu.',
  },

  cargo_ship: {
    id:            'cargo_ship',
    namePL:        'Statek Transportowy',
    icon:          '📦',
    cost:          { Fe: 150, Ti: 25, Cu: 15 },
    commodityCost: { hull_armor: 7, power_cells: 4, electronics: 2, copper_wiring: 1 },
    buildTime:     0.5,
    fuelCapacity:  10,           // max power_cells
    fuelPerAU:     0.5,          // power_cells / AU → zasięg 20 AU
    range:         20,           // AU (fallback)
    speedAU:       0.9,          // AU/rok — cargo (bazowa ×3)
    cargoCapacity: 500,          // tony — główny transportowiec
    crewCost:      0.5,          // POP zablokowany przy budowie statku
    description:   'Wielki frachtowiec do transferu surowców między koloniami.',
  },

  heavy_freighter: {
    id:            'heavy_freighter',
    namePL:        'Ciężki Frachtowiec',
    icon:          '🚛',
    cost:          { Fe: 500, Ti: 80, Pt: 100, Cu: 40, Si: 30 },
    commodityCost: {
      hull_armor:        20,
      power_cells:        8,
      electronics:        8,
      habitat_modules:    6,
      robots:             4,
    },
    buildTime:     4,
    fuelCapacity:  25,           // max power_cells
    fuelPerAU:     1.5,          // power_cells / AU → zasięg ~16.7 AU
    range:         16,           // AU (fallback)
    speedAU:       0.52,         // AU/rok — ciężki, wolny masowy transport
    cargoCapacity: 10000,        // tony — mega-frachtowiec
    crewCost:      1.5,          // POP zablokowane przy budowie statku
    requires:      'interplanetary_logistics',
    description:   'Ogromny frachtowiec do masowego transportu surowców między koloniami.',
  },

};
