// ShipsData — definicje statków kosmicznych (Etap 38 — 5 generacji)
//
// Statki budowane są w Stoczni (shipyard) i trafiają do hangaru (fleet) kolonii.
// Wymagane do ekspedycji naukowych, kolonizacyjnych i transportowych.
//
// SYSTEM:
//   cost:          { Fe: 100, Ti: 30 } — surowce z inventory
//   commodityCost: { hull_armor: 5 } — towary z inventory
//   cargoCapacity: tony — ile surowców może przewieźć statek
//   fuelCapacity:  max jednostek paliwa na pokładzie
//   fuelPerAU:     zużycie paliwa na 1 AU podróży
//   fuelType:      'power_cells' | 'power_cells_mk2' | 'fusion_cells' | 'antimatter_cells' | 'warp_cores'
//   generation:    1–5 — generacja napędu
//   range:         obliczany: fuelCapacity / fuelPerAU (AU)

export const SHIPS = {

  // ══════════════════════════════════════════════════════════════════════════
  // ── Gen I — napęd chemiczny (power_cells) ───────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  science_vessel: {
    id:            'science_vessel',
    namePL:        'Statek Naukowy',
    icon:          '🛸',
    generation:    1,
    fuelType:      'power_cells',
    cost:          { Fe: 100, Ti: 20, Cu: 15 },
    commodityCost: { hull_armor: 4, electronics: 3, power_cells: 2, copper_wiring: 2 },
    buildTime:     1,
    fuelCapacity:  8,            // max power_cells
    fuelPerAU:     0.4,          // power_cells / AU → zasięg 20 AU
    range:         20,           // AU (fallback = fuelCapacity / fuelPerAU)
    speedAU:       1.2,          // AU/rok
    cargoCapacity: 0,            // brak ładowni
    crewCost:      0.5,          // POP
    requires:      'exploration',
    capabilities:  ['recon', 'scientific', 'survey', 'deep_scan'],
    description:   'Orbitalny statek badawczy. Wymagany do ekspedycji naukowych.',
  },

  colony_ship: {
    id:            'colony_ship',
    namePL:        'Statek Kolonijny',
    icon:          '🚢',
    generation:    1,
    fuelType:      'power_cells',
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
    fuelCapacity:  8,
    fuelPerAU:     0.7,
    range:         12,
    speedAU:       0.48,
    cargoCapacity: 200,
    crewCost:      2.0,
    requires:      'colonization',
    capabilities:  ['colony'],
    description:   'Transportuje kolonistów na nowe ciało. Zużywany przy wysłaniu.',
  },

  cargo_ship: {
    id:            'cargo_ship',
    namePL:        'Statek Transportowy',
    icon:          '📦',
    generation:    1,
    fuelType:      'power_cells',
    cost:          { Fe: 150, Ti: 25, Cu: 15 },
    commodityCost: { hull_armor: 7, power_cells: 4, electronics: 2, copper_wiring: 1 },
    buildTime:     0.5,
    fuelCapacity:  10,
    fuelPerAU:     0.5,
    range:         20,
    speedAU:       0.9,
    cargoCapacity: 500,
    crewCost:      0.25,
    capabilities:  ['cargo'],
    description:   'Wielki frachtowiec do transferu surowców między koloniami.',
  },

  heavy_freighter: {
    id:            'heavy_freighter',
    namePL:        'Ciężki Frachtowiec',
    icon:          '🚛',
    generation:    1,
    fuelType:      'power_cells',
    cost:          { Fe: 500, Ti: 80, Pt: 100, Cu: 40, Si: 30 },
    commodityCost: {
      hull_armor:        20,
      power_cells:        8,
      electronics:        8,
      habitat_modules:    6,
      robots:             4,
    },
    buildTime:     4,
    fuelCapacity:  25,
    fuelPerAU:     1.5,
    range:         16,
    speedAU:       0.52,
    cargoCapacity: 10000,
    crewCost:      1.0,
    requires:      'interplanetary_logistics',
    capabilities:  ['cargo'],
    description:   'Ogromny frachtowiec do masowego transportu surowców między koloniami.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Gen II — napęd jonowy/plazmowy (power_cells_mk2) ────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  fast_scout: {
    id:            'fast_scout',
    namePL:        'Szybki Zwiadowca',
    icon:          '⚡🛸',
    generation:    2,
    fuelType:      'power_cells_mk2',
    cost:          { Fe: 80, Ti: 25, Cu: 15 },
    commodityCost: { hull_armor: 3, electronics: 4, composite_alloy: 3, ion_thrusters: 2 },
    buildTime:     0.75,
    fuelCapacity:  12,
    fuelPerAU:     0.3,
    range:         40,           // AU — daleki zasięg
    speedAU:       2.4,          // AU/rok — szybki recon
    cargoCapacity: 0,
    crewCost:      0.25,
    requires:      'ion_drives',
    capabilities:  ['recon', 'survey', 'deep_scan'],
    description:   'Szybki zwiadowca Gen II — recon ×2 szybciej, dalszy zasięg.',
  },

  bulk_freighter: {
    id:            'bulk_freighter',
    namePL:        'Frachtowiec Masowy',
    icon:          '🚢📦',
    generation:    2,
    fuelType:      'power_cells_mk2',
    cost:          { Fe: 300, Ti: 50, Cu: 25, Si: 20 },
    commodityCost: { hull_armor: 12, electronics: 5, composite_alloy: 6, power_cells_mk2: 3 },
    buildTime:     2,
    fuelCapacity:  18,
    fuelPerAU:     0.6,
    range:         30,
    speedAU:       0.7,
    cargoCapacity: 2000,
    crewCost:      0.5,
    requires:      'ion_drives',
    capabilities:  ['cargo'],
    description:   'Frachtowiec Gen II — 2000t cargo, lepszy zasięg.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Gen III — napęd fuzyjny (fusion_cells) ──────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  fusion_explorer: {
    id:            'fusion_explorer',
    namePL:        'Eksplorator Fuzyjny',
    icon:          '🔆🛸',
    generation:    3,
    fuelType:      'fusion_cells',
    cost:          { Fe: 150, Ti: 40, Cu: 20, Pt: 10 },
    commodityCost: { hull_armor: 6, electronics: 5, exotic_alloy: 4, fusion_cores: 3 },
    buildTime:     2,
    fuelCapacity:  15,
    fuelPerAU:     0.25,
    range:         60,
    speedAU:       2.7,
    cargoCapacity: 0,
    crewCost:      0.5,
    requires:      'fusion_drives',
    discoveryBonus: 0.5,  // +50% szans na odkrycie naukowe
    capabilities:  ['recon', 'scientific', 'survey', 'deep_scan'],
    description:   'Eksplorator Gen III — +50% szans odkrycia naukowego, ogromny zasięg.',
  },

  heavy_colony_ship: {
    id:            'heavy_colony_ship',
    namePL:        'Ciężki Statek Kolonijny',
    icon:          '🏗🚢',
    generation:    3,
    fuelType:      'fusion_cells',
    cost:          { Fe: 400, Ti: 80, Cu: 40, Si: 30 },
    commodityCost: {
      hull_armor:        15,
      habitat_modules:   10,
      electronics:        8,
      fusion_cores:       4,
      water_recyclers:    4,
      food_synthesizers:  3,
      exotic_alloy:       3,
    },
    buildTime:     4,
    fuelCapacity:  20,
    fuelPerAU:     0.8,
    range:         25,
    speedAU:       1.8,            // AU/rok — Gen III fuzyjny, szybszy od Gen I
    cargoCapacity: 500,
    crewCost:      5.0,
    requires:      'cryogenics',
    capabilities:  ['colony'],
    description:   'Ciężki kolonizator Gen III — 5 POPów, 500t cargo (hibernacja kriogeniczna).',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Gen IV — napęd antymateryjny (antimatter_cells) ─────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  antimatter_cruiser: {
    id:            'antimatter_cruiser',
    namePL:        'Krążownik Antymaterii',
    icon:          '💫🚀',
    generation:    4,
    fuelType:      'antimatter_cells',
    cost:          { Fe: 500, Ti: 100, Pt: 40, W: 30, Cu: 40 },
    commodityCost: {
      hull_armor:         20,
      electronics:        10,
      exotic_alloy:        8,
      antimatter_cells:    4,
      superconductors:     4,
      quantum_processors:  2,
    },
    buildTime:     5,
    fuelCapacity:  12,
    fuelPerAU:     0.15,
    range:         80,
    speedAU:       3.6,
    cargoCapacity: 2000,
    crewCost:      4.0,
    requires:      'antimatter_propulsion',
    capabilities:  ['recon', 'scientific', 'colony', 'cargo'],
    description:   'Krążownik Gen IV — wielozadaniowy, szybki, 2000t cargo.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Gen V — napęd skokowy/warp (warp_cores) ────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  starship: {
    id:            'starship',
    namePL:        'Gwiezdny Statek',
    icon:          '🌟🚀',
    generation:    5,
    fuelType:      'warp_cores',
    cost:          { Fe: 800, Ti: 200, Pt: 80, W: 60, Cu: 60 },
    commodityCost: {
      hull_armor:         30,
      electronics:        15,
      exotic_alloy:       12,
      quantum_processors:  6,
      warp_cores:          4,
      superconductors:     6,
      fusion_cores:        6,
    },
    buildTime:     8,
    fuelCapacity:  10,
    fuelPerAU:     0.05,
    range:         200,
    speedAU:       100,           // efektywnie natychmiastowy (100 AU/rok)
    cargoCapacity: 3000,
    crewCost:      10.0,
    requires:      'warp_drive',
    warpCapable:   true,
    capabilities:  ['recon', 'scientific', 'colony', 'cargo'],
    description:   'Gwiezdny statek Gen V — natychmiastowy skok w granicach układu.',
  },

  ark_ship: {
    id:            'ark_ship',
    namePL:        'Arka',
    icon:          '🌌🚢',
    generation:    5,
    fuelType:      'warp_cores',
    cost:          { Fe: 2000, Ti: 500, Pt: 200, W: 150, Cu: 150, Si: 100 },
    commodityCost: {
      hull_armor:         60,
      habitat_modules:    40,
      electronics:        30,
      exotic_alloy:       20,
      quantum_processors: 10,
      warp_cores:         10,
      superconductors:    10,
      fusion_cores:       10,
      food_synthesizers:   8,
      water_recyclers:     8,
      robots:              6,
    },
    buildTime:     15,
    fuelCapacity:  20,
    fuelPerAU:     0.05,
    range:         400,
    speedAU:       100,
    cargoCapacity: 5000,
    crewCost:      20.0,
    requires:      'interstellar_colonization',
    warpCapable:   true,
    isVictoryShip: true,
    capabilities:  ['colony', 'cargo'],
    description:   'Arka — masowy statek kolonizacyjny. Warunek zwycięstwa: wyślij Arkę.',
  },

};
