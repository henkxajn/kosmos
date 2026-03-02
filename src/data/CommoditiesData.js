// CommoditiesData — definicje 10 towarów wytwarzanych w fabrykach
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
    id:           'steel_plates',
    namePL:       'Płyty Stalowe',
    icon:         '🔧',
    tier:         1,
    recipe:       { Fe: 8, C: 4 },
    baseTime:     1.5,     // lata/szt przy 1 punkcie produkcji
    weight:       3.0,
    description:  'Podstawowy materiał budowlany — stal z żelaza i węgla',
  },

  polymer_composites: {
    id:           'polymer_composites',
    namePL:       'Polimery Kompozytowe',
    icon:         '🧪',
    tier:         1,
    recipe:       { C: 12, Si: 4 },
    baseTime:     1.5,
    weight:       1.5,
    description:  'Lekkie kompozyty węglowo-krzemowe — izolacja i obudowy',
  },

  // ── Tier 2 — komponenty zaawansowane ──────────────────────────────────────

  power_cells: {
    id:           'power_cells',
    namePL:       'Ogniwa Zasilające',
    icon:         '🔋',
    tier:         2,
    recipe:       { Li: 6, Cu: 4, Si: 2 },
    baseTime:     3,
    weight:       2.0,
    description:  'Litowo-miedziowe ogniwa akumulatorowe — zasilanie mobilne',
  },

  electronics: {
    id:           'electronics',
    namePL:       'Elektronika',
    icon:         '💻',
    tier:         2,
    recipe:       { Si: 8, Cu: 6, C: 2 },
    baseTime:     3,
    weight:       1.0,
    description:  'Układy scalone i systemy sterowania',
  },

  food_synthesizers: {
    id:           'food_synthesizers',
    namePL:       'Syntezatory Żywności',
    icon:         '🧬',
    tier:         2,
    recipe:       { C: 8, Cu: 4, Pt: 2 },
    baseTime:     3,
    weight:       2.5,
    description:  'Syntetyczna produkcja żywności na jałowych ciałach',
  },

  mining_drills: {
    id:           'mining_drills',
    namePL:       'Wiertła Górnicze',
    icon:         '⛏',
    tier:         2,
    recipe:       { C: 10, Fe: 6, W: 2 },
    baseTime:     3,
    weight:       4.0,
    description:  'Zaawansowane wiertła do głębokich złóż',
  },

  hull_armor: {
    id:           'hull_armor',
    namePL:       'Opancerzenie Kadłuba',
    icon:         '🛡',
    tier:         2,
    recipe:       { Ti: 8, Fe: 6, W: 4 },
    baseTime:     3,
    weight:       5.0,
    description:  'Tytanowo-wolframowy pancerz kadłubów statków',
  },

  // ── Tier 3 — zaawansowana technologia ─────────────────────────────────────

  semiconductors: {
    id:           'semiconductors',
    namePL:       'Półprzewodniki',
    icon:         '🔬',
    tier:         3,
    recipe:       { Si: 10, Cu: 4, Pt: 3, Xe: 1 },
    baseTime:     6,
    weight:       0.5,
    description:  'Ultra-czyste kryształy do zaawansowanej elektroniki',
  },

  ion_thrusters: {
    id:           'ion_thrusters',
    namePL:       'Silniki Jonowe',
    icon:         '🚀',
    tier:         3,
    recipe:       { Ti: 6, Xe: 4, Cu: 4, W: 3, Li: 2 },
    baseTime:     6,
    weight:       3.0,
    description:  'Ksenonowe silniki jonowe — napęd statków dalekiego zasięgu',
  },

  // ── Tier 4 — technologia przełomowa ───────────────────────────────────────

  quantum_cores: {
    id:           'quantum_cores',
    namePL:       'Rdzenie Kwantowe',
    icon:         '⚛',
    tier:         4,
    recipe:       { Si: 6, Nt: 4, Pt: 4, Xe: 3, Ti: 2, Li: 2 },
    baseTime:     12,
    weight:       1.0,
    description:  'Procesory kwantowe — klucz do teleportacji i FTL',
  },
};

// ── Krótkie nazwy PL do UI ────────────────────────────────────────────────
export const COMMODITY_SHORT = {
  steel_plates:       'Stal',
  polymer_composites: 'Polimery',
  power_cells:        'Ogniwa',
  electronics:        'Elektr.',
  food_synthesizers:  'Synt.żyw.',
  mining_drills:      'Wiertła',
  hull_armor:         'Pancerz',
  semiconductors:     'Półprzew.',
  ion_thrusters:      'Sil.jon.',
  quantum_cores:      'Rdzenie Q',
};

// ── Pomocniki ───────────────────────────────────────────────────────────────

// Lista commodity IDs pogrupowana wg tieru
export const COMMODITY_BY_TIER = {
  1: ['steel_plates', 'polymer_composites'],
  2: ['power_cells', 'electronics', 'food_synthesizers', 'mining_drills', 'hull_armor'],
  3: ['semiconductors', 'ion_thrusters'],
  4: ['quantum_cores'],
};

// Formatuj recepturę jako czytelny string
// np. { Fe: 8, C: 4 } → "8 Fe + 4 C"
export function formatRecipe(recipe) {
  return Object.entries(recipe)
    .map(([res, qty]) => `${qty} ${res}`)
    .join(' + ');
}

// Zasoby startowe (commodities) dla nowych gier
// 20 szt. każdego T1 i T2, 0 dla T3/T4
export const STARTING_COMMODITIES = {
  steel_plates:       20,
  polymer_composites: 20,
  power_cells:        20,
  electronics:        20,
  food_synthesizers:  20,
  mining_drills:      20,
  hull_armor:         20,
  semiconductors:     0,
  ion_thrusters:      0,
  quantum_cores:      0,
};
