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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
  },

  // ── Dobra konsumpcyjne (Tier 1–2) ─────────────────────────────────────────

  spare_parts: {
    id:          'spare_parts',
    namePL:      'Części Zamienne',
    icon:        '🔩',
    tier:        1,
    recipe:      { Fe: 4, Cu: 2, C: 1 },
    baseTime:    0.20,
    weight:      2.0,
    description: 'Filtry, uszczelki, przewody - utrzymują infrastrukturę',
    isConsumerGood: true, consumptionLayer: 'functioning',
  },

  pharmaceuticals: {
    id:          'pharmaceuticals',
    namePL:      'Farmaceutyki',
    icon:        '💊',
    tier:        1,
    recipe:      { C: 4, water: 2, Si: 1 },
    baseTime:    0.25,
    weight:      1.0,
    description: 'Leki, środki higieny, antybiotyki',
    isConsumerGood: true, consumptionLayer: 'functioning',
  },

  life_support_filters: {
    id:          'life_support_filters',
    namePL:      'Filtry Życiowe',
    icon:        '🫁',
    tier:        1,
    recipe:      { Fe: 2, C: 3, Cu: 1 },
    baseTime:    0.20,
    weight:      1.5,
    description: 'Systemy filtracji powietrza i oczyszczania',
    isConsumerGood: true, consumptionLayer: 'functioning',
  },

  synthetics: {
    id:          'synthetics',
    namePL:      'Tworzywa',
    icon:        '👕',
    tier:        1,
    recipe:      { C: 5, Si: 2 },
    baseTime:    0.20,
    weight:      1.5,
    description: 'Ubrania, meble, naczynia - tworzywa codziennego użytku',
    isConsumerGood: true, consumptionLayer: 'comfort',
  },

  personal_electronics: {
    id:          'personal_electronics',
    namePL:      'Elektronika Osobista',
    icon:        '📱',
    tier:        2,
    recipe:      { Si: 4, Cu: 3, Li: 1 },
    baseTime:    0.40,
    weight:      1.0,
    description: 'Komunikatory, rozrywka, urządzenia osobiste',
    isConsumerGood: true, consumptionLayer: 'comfort',
  },

  gourmet_food: {
    id:          'gourmet_food',
    namePL:      'Żywność Premium',
    icon:        '🍽️',
    tier:        2,
    recipe:      { food: 4, C: 2, water: 1 },
    baseTime:    0.40,
    weight:      2.0,
    description: 'Przetworzona żywność z teksturą i smakiem',
    isConsumerGood: true, consumptionLayer: 'luxury',
  },

  stimulants: {
    id:          'stimulants',
    namePL:      'Stymulatory',
    icon:        '☕',
    tier:        1,
    recipe:      { C: 3, water: 1, Si: 1 },
    baseTime:    0.30,
    weight:      0.5,
    description: 'Kawa syntetyczna, nootropiki, suplementy',
    isConsumerGood: true, consumptionLayer: 'luxury',
  },

  // ── Tier 2 — nowe komponenty (Etap 38) ────────────────────────────────────

  composite_alloy: {
    id:          'composite_alloy',
    namePL:      'Stop Kompozytowy',
    icon:        '🔩',
    tier:        2,
    recipe:      { Ti: 6, Fe: 4, Cu: 3 },
    baseTime:    0.5,
    weight:      3.0,
    description: 'Lekki, trwały stop — potrzebny do statków Gen II',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'advanced_materials',
  },

  bio_samples: {
    id:          'bio_samples',
    namePL:      'Próbki Biologiczne',
    icon:        '🧫',
    tier:        2,
    recipe:      { C: 6, water: 4, food: 3 },
    baseTime:    0.5,
    weight:      1.0,
    description: 'Materiał biologiczny do badań genetycznych i medycyny',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'genetic_engineering',
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
    isConsumerGood: true, consumptionLayer: 'luxury',
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'nanofabrication',
  },

  power_cells_mk2: {
    id:          'power_cells_mk2',
    namePL:      'Ogniwa Zasilające Mk2',
    icon:        '🔋⚡',
    tier:        3,
    recipe:      { Li: 8, Cu: 6, Si: 4, electronics: 2 },
    baseTime:    1.5,
    weight:      2.0,
    description: 'Ogniwa nowej generacji — 2× pojemność, paliwo statków Gen II',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'battery_tech',
  },

  exotic_alloy: {
    id:          'exotic_alloy',
    namePL:      'Stop Egzotyczny',
    icon:        '✨',
    tier:        3,
    recipe:      { Ti: 6, W: 4, Pt: 3, Xe: 2 },
    baseTime:    3.0,
    weight:      2.5,
    description: 'Zaawansowany stop z egzotycznych metali — statki Gen III+, budynki T4+',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'exotic_materials',
  },

  quantum_processors: {
    id:          'quantum_processors',
    namePL:      'Procesory Kwantowe',
    icon:        '⚛💻',
    tier:        3,
    recipe:      { Si: 8, Pt: 4, Xe: 3, Nt: 2 },
    baseTime:    4.0,
    weight:      0.5,
    description: 'Procesory kwantowe — AI Core, obliczenia kwantowe',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'quantum_physics',
  },

  fusion_cells: {
    id:          'fusion_cells',
    namePL:      'Ogniwa Fuzyjne',
    icon:        '🔆🔋',
    tier:        3,
    recipe:      { Li: 6, Ti: 4, fusion_cores: 1 },
    baseTime:    2.0,
    weight:      2.5,
    description: 'Ogniwa fuzyjne — paliwo statków Gen III',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'fusion_drives',
  },

  superconductors: {
    id:          'superconductors',
    namePL:      'Nadprzewodniki',
    icon:        '❄🔌',
    tier:        3,
    recipe:      { Pt: 6, Cu: 4, W: 3 },
    baseTime:    3.0,
    weight:      1.5,
    description: 'Materiały nadprzewodzące — statki Gen IV, zaawansowana elektronika',
    isConsumerGood: false, consumptionLayer: null,
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
    isConsumerGood: false, consumptionLayer: null,
  },

  antimatter_cells: {
    id:          'antimatter_cells',
    namePL:      'Ogniwa Antymaterii',
    icon:        '💫',
    tier:        4,
    recipe:      { Nt: 4, Xe: 4, Pt: 3, Li: 2 },
    baseTime:    7.5,
    weight:      0.5,
    description: 'Ogniwa antymaterii — paliwo statków Gen IV i mega-źródło energii',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'antimatter_containment',
  },

  // ── Tier 5 — technologia endgame ─────────────────────────────────────────

  warp_cores: {
    id:          'warp_cores',
    namePL:      'Rdzenie Warp',
    icon:        '🌀',
    tier:        5,
    recipe:      { quantum_cores: 2, antimatter_cells: 2, Ti: 8 },
    baseTime:    10.0,
    weight:      3.0,
    description: 'Rdzenie napędu skokowego — paliwo statków Gen V',
    isConsumerGood: false, consumptionLayer: null,
    requiresTech: 'warp_drive',
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
  spare_parts:        'Cz.zamien.',
  pharmaceuticals:    'Farmaceut.',
  life_support_filters: 'Filtry żyć.',
  synthetics:         'Tworzywa',
  personal_electronics: 'El.osobista',
  gourmet_food:       'Żywn.prem.',
  stimulants:         'Stymulat.',
  semiconductors:     'Półprzew.',
  ion_thrusters:      'Sil.jon.',
  fusion_cores:       'Rdz.fuzji',
  nanotech_filters:   'Nanofiltr.',
  quantum_cores:      'Rdzenie Q',
  antimatter_cells:   'Antymat.',
  composite_alloy:    'St.komp.',
  bio_samples:        'Próbki bio',
  power_cells_mk2:    'Ogniwa Mk2',
  exotic_alloy:       'St.egzot.',
  quantum_processors: 'Proc.Q',
  fusion_cells:       'Ogn.fuz.',
  superconductors:    'Nadprzew.',
  warp_cores:         'Rdz.warp',
};

// ── Pomocniki ───────────────────────────────────────────────────────────────

// Lista commodity IDs pogrupowana wg tieru
export const COMMODITY_BY_TIER = {
  1: ['steel_plates', 'polymer_composites', 'concrete_mix', 'copper_wiring',
      'spare_parts', 'pharmaceuticals', 'life_support_filters', 'synthetics', 'stimulants'],
  2: ['power_cells', 'electronics', 'food_synthesizers', 'mining_drills', 'hull_armor',
      'habitat_modules', 'water_recyclers', 'robots',
      'prefab_mine', 'prefab_solar_farm', 'prefab_habitat', 'prefab_autonomous_mine',
      'prefab_autonomous_solar_farm', 'prefab_spaceport', 'prefab_autonomous_spaceport',
      'personal_electronics', 'gourmet_food',
      'composite_alloy', 'bio_samples'],
  3: ['semiconductors', 'ion_thrusters', 'fusion_cores', 'nanotech_filters',
      'power_cells_mk2', 'exotic_alloy', 'quantum_processors', 'fusion_cells', 'superconductors'],
  4: ['quantum_cores', 'antimatter_cells'],
  5: ['warp_cores'],
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
  spare_parts:        0,
  pharmaceuticals:    0,
  life_support_filters: 0,
  synthetics:         0,
  personal_electronics: 0,
  gourmet_food:       0,
  stimulants:         0,
  semiconductors:     0,
  ion_thrusters:      0,
  fusion_cores:       0,
  nanotech_filters:   0,
  quantum_cores:      0,
  antimatter_cells:   0,
  composite_alloy:    0,
  bio_samples:        0,
  power_cells_mk2:    0,
  exotic_alloy:       0,
  quantum_processors: 0,
  fusion_cells:       0,
  superconductors:    0,
  warp_cores:         0,
};
