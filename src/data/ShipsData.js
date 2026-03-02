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
    commodityCost: { hull_armor: 3, electronics: 2, power_cells: 1 },
    buildTime:     8,
    fuelCapacity:  8,            // max power_cells
    fuelPerAU:     0.4,          // power_cells / AU → zasięg 20 AU
    range:         20,           // AU (fallback = fuelCapacity / fuelPerAU)
    cargoCapacity: 50,           // tony
    requires:      'exploration',
    description:   'Orbitalny statek badawczy. Wymagany do ekspedycji naukowych.',
  },

  colony_ship: {
    id:            'colony_ship',
    namePL:        'Statek Kolonijny',
    icon:          '🚢',
    cost:          { Fe: 200, Ti: 40, Cu: 20, Si: 20 },
    commodityCost: { hull_armor: 8, electronics: 4, power_cells: 4 },
    buildTime:     12,
    fuelCapacity:  8,            // max power_cells
    fuelPerAU:     0.7,          // power_cells / AU → zasięg ~11.4 AU
    range:         12,           // AU (fallback)
    cargoCapacity: 200,          // tony
    requires:      'colonization',
    description:   'Transportuje kolonistów na nowe ciało. Zużywany przy wysłaniu.',
  },

  cargo_ship: {
    id:            'cargo_ship',
    namePL:        'Statek Transportowy',
    icon:          '📦',
    cost:          { Fe: 150, Ti: 25, Cu: 15 },
    commodityCost: { hull_armor: 5, power_cells: 3 },
    buildTime:     6,
    fuelCapacity:  10,           // max power_cells
    fuelPerAU:     0.5,          // power_cells / AU → zasięg 20 AU
    range:         20,           // AU (fallback)
    cargoCapacity: 500,          // tony — główny transportowiec
    requires:      'interplanetary_logistics',
    description:   'Wielki frachtowiec do transferu surowców między koloniami.',
  },

  // ── Tier 2: placeholder na przyszłość (napęd fusion) ─────────────────
  // fusion_cruiser: {
  //   id:            'fusion_cruiser',
  //   namePL:        'Krążownik Fuzyjny',
  //   icon:          '⚡',
  //   fuelType:      'deuterium_fuel', // Tier 2 paliwo (commodity Tier 3)
  //   fuelCapacity:  20,
  //   fuelPerAU:     0.2,
  //   range:         100,
  //   ...
  // },
};
