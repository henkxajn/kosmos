// ShipsData — definicje statków kosmicznych
//
// Statki budowane są w Stoczni (shipyard) i trafiają do hangaru (fleet) kolonii.
// Wymagane do ekspedycji naukowych, kolonizacyjnych i transportowych.
//
// NOWY SYSTEM (Etap 26):
//   cost:          { Fe: 100, Ti: 30 } — surowce z inventory
//   commodityCost: { hull_armor: 5 } — towary z inventory
//   cargoCapacity: tony — ile surowców może przewieźć statek
//   range:         AU — maksymalny zasięg misji (orbital distance)

export const SHIPS = {
  science_vessel: {
    id:            'science_vessel',
    namePL:        'Statek Naukowy',
    icon:          '🛸',
    cost:          { Fe: 100, Ti: 20, Cu: 15 },
    commodityCost: { hull_armor: 3, electronics: 2, power_cells: 1 },
    buildTime:     8,
    range:         20,           // AU
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
    range:         12,           // AU — krótszy, wymusza ekspansję krok po kroku
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
    range:         15,           // AU
    cargoCapacity: 500,          // tony — główny transportowiec
    requires:      'interplanetary_logistics',
    description:   'Wielki frachtowiec do transferu surowców między koloniami.',
  },
};
