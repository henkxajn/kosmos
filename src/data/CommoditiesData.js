// CommoditiesData — definicje 17 towarów wytwarzanych w fabrykach
//
// Towary (commodities) = produkty przetworzone z surowców wydobywalnych.
// Wymagane do budowy zaawansowanych budynków i statków.
//
// Tier:       1–4 (wyższy = droższy)
// Recipe:     { resourceId: ilość } — surowce zużywane na 1 sztukę
// BaseTime:   lata gry na 1 sztukę przy 1 punkcie produkcji
// Weight:     tony na sztukę (do cargo capacity statków)

export const COMMODITIES = {

  // ── Tier 1 — podstawowe materiały budowlane ──────────────────────────────

  steel_plates: {
    id:          'steel_plates',
    namePL:      'Płyty Stalowe',
    icon:        '🔧',
    tier:        1,
    recipe:      { Fe: 8, C: 4 },
    baseTime:    0.1875,
    weight:      3.0,
    description: 'Podstawowy materiał budowlany — stal z żelaza i węgla',
  },

  polymer_composites: {
    id:          'polymer_composites',
    namePL:      'Polimery Kompozytowe',
    icon:        '🧪',
    tier:        1,
    recipe:      { C: 12, Si: 4 },
    baseTime:    0.1875,
    weight:      1.5,
    description: 'Lekkie kompozyty węglowo-krzemowe — izolacja i obudowy',
  },

  concrete_mix: {
    id:          'concrete_mix',
    namePL:      'Mieszanka Betonowa',
    icon:        '🪨',
    tier:        1,
    recipe:      { Si: 10, Fe: 6, C: 4 },
    baseTime:    0.1875,
    weight:      5.0,
    description: 'Ciężka mieszanka budowlana — fundamenty i ściany',
  },

  copper_wiring: {
    id:          'copper_wiring',
    namePL:      'Instalacje Miedziane',
    icon:        '🔌',
    tier:        1,
    recipe:      { Cu: 10, C: 2 },
    baseTime:    0.125,
    weight:      1.5,
    description: 'Okablowanie elektryczne — niezbędne w każdym budynku energetycznym',
  },

  // ── Tier 2 — komponenty zaawansowane ──────────────────────────────────────

  power_cells: {
    id:          'power_cells',
    namePL:      'Ogniwa Zasilające',
    icon:        '🔋',
    tier:        2,
    recipe:      { Li: 6, Cu: 4, Si: 2 },
    baseTime:    0.375,
    weight:      2.0,
    description: 'Litowo-miedziowe ogniwa akumulatorowe — zasilanie mobilne',
  },

  electronics: {
    id:          'electronics',
    namePL:      'Elektronika',
    icon:        '💻',
    tier:        2,
    recipe:      { Si: 8, Cu: 6, C: 2 },
    baseTime:    0.375,
    weight:      1.0,
    description: 'Układy scalone i systemy sterowania',
  },

  food_synthesizers: {
    id:          'food_synthesizers',
    namePL:      'Syntezatory Żywności',
    icon:        '🧬',
    tier:        2,
    recipe:      { C: 10, Cu: 6, Fe: 2 },
    baseTime:    0.375,
    weight:      2.5,
    description: 'Syntetyczna produkcja żywności na jałowych ciałach',
  },

  mining_drills: {
    id:          'mining_drills',
    namePL:      'Wiertła Górnicze',
    icon:        '⛏',
    tier:        2,
    recipe:      { C: 10, Fe: 6, W: 2 },
    baseTime:    0.375,
    weight:      4.0,
    description: 'Zaawansowane wiertła do głębokich złóż',
  },

  hull_armor: {
    id:          'hull_armor',
    namePL:      'Opancerzenie Kadłuba',
    icon:        '🛡',
    tier:        2,
    recipe:      { Ti: 8, Fe: 6, W: 4 },
    baseTime:    0.375,
    weight:      5.0,
    description: 'Tytanowo-wolframowy pancerz kadłubów statków',
  },

  habitat_modules: {
    id:          'habitat_modules',
    namePL:      'Moduły Habitatu',
    icon:        '🏗',
    tier:        2,
    recipe:      { Ti: 6, Fe: 5, Si: 4, Cu: 3 },
    baseTime:    0.5,
    weight:      6.0,
    description: 'Ciśnieniowe moduły mieszkalne — umożliwiają życie w próżni i wrogiej atmosferze',
  },

  water_recyclers: {
    id:          'water_recyclers',
    namePL:      'Recyklery Wody',
    icon:        '♻',
    tier:        2,
    recipe:      { Cu: 6, Si: 4, Fe: 2 },
    baseTime:    0.375,
    weight:      2.0,
    description: 'Zamknięty obieg wody — niezbędny na ciałach bez zasobów wodnych',
  },

  robots: {
    id:          'robots',
    namePL:      'Roboty',
    icon:        '🤖',
    tier:        2,
    recipe:      { Fe: 4, Cu: 3, Si: 2, electronics: 2 },
    baseTime:    0.625,
    weight:      3.5,
    description: 'Autonomiczne roboty — do kopalń, automatyzacji i innych zastosowań',
  },

  // ── Prefabrykaty (Tier 2) — deployowane z cargo na kolonie ─────────────────

  prefab_mine: {
    id:          'prefab_mine',
    namePL:      'Prefab: Kopalnia',
    icon:        '📦⛏',
    tier:        2,
    recipe:      { Fe: 25, C: 12, W: 3, Ti: 3 },
    baseTime:    0.15,
    weight:      40.0,
    isPrefab:    true,
    deploysBuilding: 'mine',
    description: 'Prefabrykowana kopalnia — natychmiastowy deploy z cargo',
  },

  prefab_solar_farm: {
    id:          'prefab_solar_farm',
    namePL:      'Prefab: Elektrownia Słoneczna',
    icon:        '📦☀',
    tier:        2,
    recipe:      { Si: 18, Cu: 8, Fe: 6 },
    baseTime:    0.1,
    weight:      25.0,
    isPrefab:    true,
    deploysBuilding: 'solar_farm',
    description: 'Prefabrykowana elektrownia — natychmiastowy deploy z cargo',
  },

  prefab_habitat: {
    id:          'prefab_habitat',
    namePL:      'Prefab: Habitat',
    icon:        '📦🏠',
    tier:        2,
    recipe:      { Fe: 30, Ti: 8, Si: 12 },
    baseTime:    0.2,
    weight:      50.0,
    isPrefab:    true,
    deploysBuilding: 'habitat',
    description: 'Prefabrykowany habitat — natychmiastowy deploy z cargo',
  },

  prefab_autonomous_mine: {
    id:          'prefab_autonomous_mine',
    namePL:      'Prefab: Kopalnia Autonomiczna',
    icon:        '📦🤖',
    tier:        2,
    recipe:      { Fe: 35, Cu: 8, Ti: 10 },
    baseTime:    0.25,
    weight:      55.0,
    isPrefab:    true,
    deploysBuilding: 'autonomous_mine',
    description: 'Prefabrykowana kopalnia autonomiczna — natychmiastowy deploy z cargo',
  },

  prefab_autonomous_solar_farm: {
    id:          'prefab_autonomous_solar_farm',
    namePL:      'Prefab: Autonomiczna Elektrownia',
    icon:        '📦🤖☀',
    tier:        2,
    recipe:      { Si: 22, Cu: 10, Ti: 6, Fe: 8 },
    baseTime:    0.2,
    weight:      40.0,
    isPrefab:    true,
    deploysBuilding: 'autonomous_solar_farm',
    description: 'Prefabrykowana autonomiczna elektrownia słoneczna — natychmiastowy deploy z cargo',
  },

  prefab_spaceport: {
    id:          'prefab_spaceport',
    namePL:      'Prefab: Port Kosmiczny',
    icon:        '📦🚀',
    tier:        2,
    recipe:      { Fe: 1200, Ti: 100, Cu: 300 },
    baseTime:    0.5,
    weight:      120.0,
    isPrefab:    true,
    deploysBuilding: 'launch_pad',
    description: 'Prefabrykowany port kosmiczny — natychmiastowy deploy z cargo',
  },

  prefab_autonomous_spaceport: {
    id:          'prefab_autonomous_spaceport',
    namePL:      'Prefab: Aut. Port Kosmiczny',
    icon:        '📦🛰',
    tier:        2,
    recipe:      { Fe: 1000, Ti: 150, Cu: 300, Si: 200 },
    baseTime:    0.5,
    weight:      130.0,
    isPrefab:    true,
    deploysBuilding: 'autonomous_spaceport',
    description: 'Prefabrykowany autonomiczny port kosmiczny — natychmiastowy deploy z cargo',
  },

  // ── Tier 3 — zaawansowana technologia ─────────────────────────────────────

  semiconductors: {
    id:          'semiconductors',
    namePL:      'Półprzewodniki',
    icon:        '🔬',
    tier:        3,
    recipe:      { Si: 10, Cu: 4, Pt: 3, Xe: 1 },
    baseTime:    3.0,
    weight:      0.5,
    description: 'Ultra-czyste kryształy do zaawansowanej elektroniki',
  },

  ion_thrusters: {
    id:          'ion_thrusters',
    namePL:      'Silniki Jonowe',
    icon:        '🚀',
    tier:        3,
    recipe:      { Ti: 6, Xe: 4, Cu: 4, W: 3, Li: 2 },
    baseTime:    3.0,
    weight:      3.0,
    description: 'Ksenonowe silniki jonowe — napęd statków dalekiego zasięgu',
  },

  fusion_cores: {
    id:          'fusion_cores',
    namePL:      'Rdzenie Fuzyjne',
    icon:        '🔆',
    tier:        3,
    recipe:      { Ti: 8, W: 6, Li: 4, Nt: 3 },
    baseTime:    4.0,
    weight:      4.0,
    description: 'Reaktory termojądrowe — nieograniczone źródło energii',
  },

  nanotech_filters: {
    id:          'nanotech_filters',
    namePL:      'Filtry Nanotechnologiczne',
    icon:        '🌫',
    tier:        3,
    recipe:      { Si: 6, Pt: 4, Cu: 3, Nt: 1 },
    baseTime:    3.0,
    weight:      0.3,
    description: 'Filtry nanotechnologiczne — oczyszczanie powietrza i wody, terraforming',
  },

  // ── Tier 4 — technologia przełomowa ───────────────────────────────────────

  quantum_cores: {
    id:          'quantum_cores',
    namePL:      'Rdzenie Kwantowe',
    icon:        '⚛',
    tier:        4,
    recipe:      { Si: 6, Nt: 4, Pt: 4, Xe: 3, Ti: 2, Li: 2 },
    baseTime:    6.0,
    weight:      1.0,
    description: 'Procesory kwantowe — klucz do teleportacji i FTL',
  },

  antimatter_cells: {
    id:          'antimatter_cells',
    namePL:      'Ogniwa Antymaterii',
    icon:        '💫',
    tier:        4,
    recipe:      { Nt: 4, Xe: 4, Pt: 3, Li: 2 },
    baseTime:    7.5,
    weight:      0.5,
    description: 'Ogniwa antymaterii — napęd FTL i mega-źródło energii',
  },
};

// ── Krótkie nazwy PL do UI ────────────────────────────────────────────────
export const COMMODITY_SHORT = {
  steel_plates:       'Stal',
  polymer_composites: 'Polimery',
  concrete_mix:       'Beton',
  copper_wiring:      'Kablowanie',
  power_cells:        'Ogniwa',
  electronics:        'Elektron.',
  food_synthesizers:  'Synt.żyw.',
  mining_drills:      'Wiertła',
  hull_armor:         'Pancerz',
  habitat_modules:    'Hab.moduły',
  water_recyclers:    'Recykl.wody',
  robots:             'Roboty',
  prefab_mine:        'Pref.Kop.',
  prefab_solar_farm:  'Pref.Sol.',
  prefab_habitat:     'Pref.Hab.',
  prefab_autonomous_mine: 'Pref.A.Kop.',
  prefab_autonomous_solar_farm: 'Pref.A.Sol.',
  prefab_spaceport:             'Pref.Port',
  prefab_autonomous_spaceport:  'Pref.A.Port',
  semiconductors:     'Półprzew.',
  ion_thrusters:      'Sil.jon.',
  fusion_cores:       'Rdz.fuzji',
  nanotech_filters:   'Nanofiltr.',
  quantum_cores:      'Rdzenie Q',
  antimatter_cells:   'Antymat.',
};

// ── Pomocniki ───────────────────────────────────────────────────────────────

// Lista commodity IDs pogrupowana wg tieru
export const COMMODITY_BY_TIER = {
  1: ['steel_plates', 'polymer_composites', 'concrete_mix', 'copper_wiring'],
  2: ['power_cells', 'electronics', 'food_synthesizers', 'mining_drills', 'hull_armor',
      'habitat_modules', 'water_recyclers', 'robots',
      'prefab_mine', 'prefab_solar_farm', 'prefab_habitat', 'prefab_autonomous_mine',
      'prefab_autonomous_solar_farm', 'prefab_spaceport', 'prefab_autonomous_spaceport'],
  3: ['semiconductors', 'ion_thrusters', 'fusion_cores', 'nanotech_filters'],
  4: ['quantum_cores', 'antimatter_cells'],
};

// Formatuj recepturę jako czytelny string
// np. { Fe: 8, C: 4 } → "8 Fe + 4 C"
export function formatRecipe(recipe) {
  return Object.entries(recipe)
    .map(([res, qty]) => `${qty} ${res}`)
    .join(' + ');
}

// Zasoby startowe (commodities) dla nowych gier
export const STARTING_COMMODITIES = {
  steel_plates:       15,
  polymer_composites: 10,
  concrete_mix:       8,
  copper_wiring:      8,
  power_cells:        12,
  electronics:        6,
  food_synthesizers:  3,
  mining_drills:      5,
  hull_armor:         4,
  habitat_modules:    4,
  water_recyclers:    3,
  robots:             0,
  prefab_mine:        0,
  prefab_solar_farm:  0,
  prefab_habitat:     0,
  prefab_autonomous_mine: 0,
  prefab_autonomous_solar_farm: 0,
  prefab_spaceport:             0,
  prefab_autonomous_spaceport:  0,
  semiconductors:     0,
  ion_thrusters:      0,
  fusion_cores:       0,
  nanotech_filters:   0,
  quantum_cores:      0,
  antimatter_cells:   0,
};
