import { COMMODITIES, COMMODITY_SHORT } from './CommoditiesData.js';

// BuildingsData — definicje budynków możliwych do postawienia na polach hex
//
// NOWY SYSTEM (Etap 26):
//   cost:          { Fe: 20, C: 10 } — surowce z inventory
//   commodityCost: { steel_plates: 2 } — towary z inventory
//   energyCost:    2 — stały koszt energii/rok (dodawany do rates jako ujemna energia)
//   rates:         produkcja/konsumpcja per rok (PRZED modyfikatorami terenu i poziomu)
//   maxLevel:      max poziom budynku (domyślnie 10, ograniczany przez tech)
//
// category: klucz zgodny z HexTile.allowedCategories
// terrainOnly: null = według category; tablica = tylko te typy terenu
// terrainAny:  true = gdziekolwiek buildable
// housing:     przyrost miejsc mieszkalnych
// popCost:     koszt POP do obsługi budynku
// requires:    id technologii wymaganej

export const BUILDINGS = {

  // ── Baza ──────────────────────────────────────────────────────────────────

  colony_base: {
    id:          'colony_base',
    namePL:      'Stolica',
    category:    'population',
    icon:        '🏛',
    description: 'Stolica cywilizacji — nie blokuje budowy na hexie',
    isCapital:   true,
    cost:        {},
    commodityCost: { steel_plates: 2, electronics: 1 },
    energyCost:  2,
    buildTime:   0,           // natychmiastowa
    rates:       { food: 3, research: 2 },  // bazowa produkcja: 1 POP wyżywiony + powolne badania
    maintenance: {},           // Stolica bez maintenance
    housing:     4,
    popCost:     0,
    maxLevel:    1,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    null,
    isColonyBase: true,
  },

  // ── Wydobycie ─────────────────────────────────────────────────────────────

  mine: {
    id:          'mine',
    namePL:      'Kopalnia',
    category:    'mining',
    icon:        '⛏',
    description: 'Wydobywa surowce z podłoża — zależy od złóż na ciele niebieskim',
    cost:        { Fe: 20, C: 10 },
    commodityCost: { steel_plates: 3, mining_drills: 2, power_cells: 1 },
    energyCost:  2,
    buildTime:   0.375,    // lata gry
    rates:       {},       // produkcja obliczana dynamicznie z deposits
    maintenance: { Fe: 1 },  // wiertła
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
    isMine:      true,     // flaga: kopalnia wydobywa z deposits
  },

  // ── Energia ───────────────────────────────────────────────────────────────

  solar_farm: {
    id:          'solar_farm',
    namePL:      'Elektrownia Słoneczna',
    category:    'energy',
    icon:        '☀',
    description: 'Zamienia promieniowanie gwiazdy w energię elektryczną',
    cost:        { Fe: 15, Si: 20, Cu: 8 },
    commodityCost: { steel_plates: 4, power_cells: 3, copper_wiring: 2 },
    energyCost:  0,
    buildTime:   0.375,    // lata gry
    rates:       { energy: 8 },
    maintenance: { Si: 1 },  // wymiana paneli
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  coal_plant: {
    id:          'coal_plant',
    namePL:      'Elektrownia Węglowa',
    category:    'energy',
    icon:        '🏭',
    description: 'Spala węgiel (C) produkując dużo energii. Wymaga stałego dopływu węgla.',
    cost:        { Fe: 20, C: 8, Si: 5, Cu: 5 },
    commodityCost: { steel_plates: 3, concrete_mix: 2, copper_wiring: 2 },
    energyCost:  0,
    buildTime:   0.5,      // lata gry
    rates:       { energy: 18, C: -6 },  // +18 energii, -6 C/rok
    maintenance: { Fe: 1, C: 1 },  // piece, węgiel
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    null,
  },

  geothermal: {
    id:          'geothermal',
    namePL:      'Elektrownia Geotermalna',
    category:    'energy',
    icon:        '♨',
    description: 'Wykorzystuje ciepło magmy — olbrzymia wydajność',
    cost:        { Fe: 30, Ti: 5 },
    commodityCost: { steel_plates: 4, power_cells: 2, copper_wiring: 1 },
    energyCost:  0,
    buildTime:   0.5,      // lata gry
    rates:       { energy: 25 },
    maintenance: { Fe: 1 },  // rury, pompy
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: ['volcano'],
    terrainAny:  false,
    requires:    null,
  },

  // ── Żywność / woda ────────────────────────────────────────────────────────

  farm: {
    id:          'farm',
    namePL:      'Farma',
    category:    'food',
    icon:        '🌾',
    description: 'Uprawy zapewniające żywność dla populacji',
    cost:        { Fe: 10, C: 5 },
    commodityCost: { steel_plates: 2, polymer_composites: 1 },
    energyCost:  1,
    buildTime:   0.25,     // lata gry
    rates:       { food: 10 },
    maintenance: {},          // farma nie wymaga utrzymania
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  well: {
    id:          'well',
    namePL:      'Studnia',
    category:    'food',
    icon:        '💧',
    description: 'Wydobywa wodę podziemną lub topnieje lód',
    cost:        { Fe: 15 },
    commodityCost: { steel_plates: 2, copper_wiring: 1 },
    energyCost:  1,
    buildTime:   0.125,    // lata gry
    rates:       { water: 6 },
    maintenance: {},          // studnia nie wymaga utrzymania
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  // ── Populacja ─────────────────────────────────────────────────────────────

  habitat: {
    id:          'habitat',
    namePL:      'Habitat',
    category:    'population',
    icon:        '🏠',
    description: 'Zapewnia przestrzeń mieszkalną dla 3 jednostek populacji',
    cost:        { Fe: 25, Si: 10 },
    commodityCost: { steel_plates: 4, habitat_modules: 3, water_recyclers: 2, electronics: 1 },
    energyCost:  3,
    buildTime:   0.5,      // lata gry
    rates:       {},
    maintenance: { Fe: 1 },  // naprawy habitat
    housing:     3,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  // ── Nauka ─────────────────────────────────────────────────────────────────

  research_station: {
    id:          'research_station',
    namePL:      'Stacja Badawcza',
    category:    'research',
    icon:        '🔬',
    description: 'Prowadzi badania naukowe — kosztowna, ale niezbędna',
    cost:        { Si: 20, Cu: 8 },
    commodityCost: { steel_plates: 3 },
    energyCost:  6,
    buildTime:   1.0,      // lata gry
    rates:       { research: 8 },
    maintenance: { Cu: 1, Si: 1 },  // elektronika, czujniki
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  // ── Fabryka (produkuje commodities) ───────────────────────────────────────

  factory: {
    id:          'factory',
    namePL:      'Fabryka',
    category:    'mining',
    icon:        '🏭',
    description: 'Daje punkt produkcji — alokuj do receptur w panelu Gospodarka',
    cost:        { Fe: 30, Cu: 10, Si: 10 },
    commodityCost: { steel_plates: 5, power_cells: 3, electronics: 2 },
    energyCost:  5,
    buildTime:   0.25,     // lata gry
    rates:       {},       // produkcja via FactorySystem, nie rates
    maintenance: { Fe: 1 },  // narzędzia, formy
    housing:     0,
    popCost:     0.5,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    'metallurgy',
  },

  // ── Zaawansowane (wymagają technologii) ──────────────────────────────────

  smelter: {
    id:          'smelter',
    namePL:      'Huta',
    category:    'mining',
    icon:        '🔥',
    description: 'Przetwarza rudę na czyste metale — zwiększa wydajność kopalni',
    cost:        { Fe: 40, Si: 15, Cu: 5 },
    commodityCost: { steel_plates: 5, power_cells: 3, mining_drills: 2 },
    energyCost:  8,
    buildTime:   0.75,     // lata gry
    rates:       {},       // bonus do kopalni (przetwarzanie)
    maintenance: { Fe: 2, C: 2 },  // piece, węgiel
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    'deep_drilling',
  },

  nuclear_plant: {
    id:          'nuclear_plant',
    namePL:      'Elektrownia Jądrowa',
    category:    'energy',
    icon:        '☢',
    description: 'Rozszczepienie atomu — ogromna produkcja energii',
    cost:        { Fe: 50, Ti: 20, Si: 15 },
    commodityCost: { steel_plates: 6, power_cells: 4, electronics: 3, fusion_cores: 2 },
    energyCost:  0,
    buildTime:   1.5,      // lata gry
    rates:       { energy: 60 },
    maintenance: { Ti: 1, Li: 1 },  // paliwo, osłony
    housing:     0,
    popCost:     0.5,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    'nuclear_power',
  },

  // ── Kosmos ────────────────────────────────────────────────────────────────

  launch_pad: {
    id:          'launch_pad',
    namePL:      'Port Kosmiczny',
    category:    'mining',
    icon:        '🚀',
    description: 'Port kosmiczny — baza startowa ekspedycji i lotów międzyplanetarnych',
    isSpaceport: true,
    cost:        { Fe: 1200, Ti: 600, Cu: 300 },
    commodityCost: { steel_plates: 120, hull_armor: 80, electronics: 60, concrete_mix: 40 },
    energyCost:  10,
    buildTime:   2.5,      // lata gry
    rates:       {},
    maintenance: { Fe: 4, Ti: 2 },  // rampy, sprzęt startowy
    housing:     0,
    popCost:     0.5,
    maxLevel:    5,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    'rocketry',
  },

  autonomous_spaceport: {
    id:            'autonomous_spaceport',
    namePL:        'Autonomiczny Port Kosmiczny',
    category:      'mining',
    icon:          '🛰',
    description:   'Zautomatyzowany port kosmiczny — działa bez załogi. Wymaga robotów.',
    isSpaceport:   true,
    isAutonomous:  true,
    cost:          { Fe: 1000, Ti: 500, Cu: 300, Si: 200 },
    commodityCost: { steel_plates: 100, robots: 60, hull_armor: 60, electronics: 50, concrete_mix: 30 },
    energyCost:    8,
    buildTime:     2.0,      // lata gry
    rates:         {},
    maintenance:   { Fe: 3, Ti: 1 },
    housing:       0,
    popCost:       0,
    maxLevel:      5,
    capacityBonus: null,
    terrainOnly:   null,
    terrainAny:    true,
    requires:      'rocketry',
  },

  // ── Stocznia ──────────────────────────────────────────────────────────────

  shipyard: {
    id:          'shipyard',
    namePL:      'Stocznia',
    category:    'space',
    icon:        '⚓',
    description: 'Buduje statki kosmiczne. Każdy poziom = 1 dodatkowy slot budowy.',
    cost:        { Fe: 80, Ti: 30, Cu: 20 },
    commodityCost: { steel_plates: 8, hull_armor: 6, electronics: 4, power_cells: 3, copper_wiring: 2 },
    energyCost:  5,
    buildTime:   1.25,     // lata gry
    rates:       {},
    maintenance: { Fe: 3, Ti: 1 },  // ciężki sprzęt
    housing:     0,
    popCost:     0.5,
    maxLevel:    5,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    'exploration',
  },
  // ── Syntetyczna żywność ───────────────────────────────────────────────────

  synthesized_food_plant: {
    id:            'synthesized_food_plant',
    namePL:        'Zakład Syntetycznej Żywności',
    category:      'food',
    icon:          '🧬',
    description:   'Produkuje żywność syntetyczną na ciałach bez gleby i atmosfery. Drogi w budowie i energochłonny.',
    cost:          { Fe: 40, Cu: 20, Si: 15, Ti: 5 },
    commodityCost: { steel_plates: 6, food_synthesizers: 5, electronics: 2, power_cells: 2 },
    energyCost:    8,
    buildTime:     0.5,     // lata gry
    rates:         { food: 6 },
    maintenance:   { Cu: 1 },  // filtry syntetyczne
    housing:       0,
    popCost:       0.5,
    maxLevel:      10,
    capacityBonus: null,
    terrainOnly:   null,
    terrainAny:    true,
    requires:      'food_synthesis',
    isSynthFood:   true,
  },

  // ── Kopalnia autonomiczna ────────────────────────────────────────────────

  autonomous_mine: {
    id:            'autonomous_mine',
    namePL:        'Kopalnia Autonomiczna',
    category:      'mining',
    icon:          '🤖',
    description:   'Wydobywa surowce bez POPów — wymaga Robotów i Wierteł.',
    cost:          { Fe: 30, Ti: 10, Cu: 5 },
    commodityCost: { steel_plates: 4, robots: 3, mining_drills: 2, power_cells: 1 },
    energyCost:    4,
    buildTime:     1.0,     // lata gry
    rates:         {},
    maintenance:   { Fe: 1 },  // konserwacja robotów
    housing:       0,
    popCost:       0,
    maxLevel:      10,
    capacityBonus: null,
    terrainOnly:   null,
    terrainAny:    false,
    requires:      null,
    isMine:        true,
    isAutonomous:  true,
  },

  // ── Autonomiczna elektrownia słoneczna ────────────────────────────────────

  autonomous_solar_farm: {
    id:            'autonomous_solar_farm',
    namePL:        'Autonomiczna Elektrownia Słoneczna',
    category:      'energy',
    icon:          '🤖☀',
    description:   'Elektrownia słoneczna obsługiwana przez roboty — działa bez POPów.',
    cost:          { Si: 20, Cu: 8, Ti: 5 },
    commodityCost: { steel_plates: 4, robots: 3, power_cells: 2, copper_wiring: 2, electronics: 1 },
    energyCost:    0,
    buildTime:     0.75,    // lata gry
    rates:         { energy: 6 },
    maintenance:   { Si: 1 },  // wymiana paneli
    housing:       0,
    popCost:       0,
    maxLevel:      10,
    capacityBonus: null,
    terrainOnly:   null,
    terrainAny:    false,
    requires:      null,
    isAutonomous:  true,
  },

  // ── Reaktor fuzyjny ─────────────────────────────────────────────────────

  fusion_reactor: {
    id:            'fusion_reactor',
    namePL:        'Reaktor Fuzyjny',
    category:      'energy',
    icon:          '🔆',
    description:   'Reaktor termojądrowy — ogromna ilość czystej energii',
    cost:          { Ti: 40, W: 20, Li: 15, Fe: 20 },
    commodityCost: { steel_plates: 6, fusion_cores: 4, copper_wiring: 3 },
    energyCost:    0,
    buildTime:     1.5,     // lata gry
    rates:         { energy: 100 },
    maintenance:   { Ti: 2, Li: 1 },  // paliwo fuzyjne, osłony
    housing:       0,
    popCost:       0.5,
    maxLevel:      5,
    capacityBonus: null,
    terrainOnly:   null,
    terrainAny:    true,
    requires:      'fusion_power',
  },

  // ── Terraformer ─────────────────────────────────────────────────────────

  terraformer: {
    id:            'terraformer',
    namePL:        'Terraformer',
    category:      'space',
    icon:          '🌍',
    description:   'Powoli przekształca atmosferę ciała niebieskiego — mega-projekt długoterminowy',
    cost:          { Ti: 50, Si: 30, W: 20, Fe: 30 },
    commodityCost: { steel_plates: 6, nanotech_filters: 4, fusion_cores: 3, electronics: 2 },
    energyCost:    20,
    buildTime:     1.5,     // lata gry
    rates:         {},
    maintenance:   { Ti: 1, Si: 1 },  // filtry, komponenty
    housing:       0,
    popCost:       0.5,
    maxLevel:      5,
    capacityBonus: null,
    terrainOnly:   null,
    terrainAny:    true,
    requires:      'terraforming',
  },
};

// ── Ikony zasobów — rozszerzony zestaw ──────────────────────────────────────
export const RESOURCE_ICONS = {
  // Mined
  C: '\u25C6', Fe: '🔩', Si: '💎', Cu: '🟤', Ti: '⬜',
  Li: '🔋', W: '⚙', Pt: '✨', Xe: '💜', Nt: '⚛',
  // Harvested
  food: '🍖', water: '💧',
  // Utility
  energy: '⚡', research: '🔬',
  // Legacy
  minerals: '⛏', organics: '🌿',
  // POP
  pop: '👤',
};

// Formatuj stawki produkcji/konsumpcji jako czytelny string
export function formatRates(rates) {
  return Object.entries(rates)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}${RESOURCE_ICONS[k] ?? k}`)
    .join('  ');
}

// Formatuj koszt jako czytelny string (surowce + commodities)
export function formatCost(cost, popCost = 0, commodityCost = null) {
  let parts = Object.entries(cost)
    .map(([k, v]) => `${v}${RESOURCE_ICONS[k] ?? k}`);
  if (commodityCost) {
    for (const [k, v] of Object.entries(commodityCost)) {
      const icon = COMMODITIES[k]?.icon ?? '📦';
      const name = COMMODITY_SHORT[k] ?? k;
      parts.push(`${v}×${icon}${name}`);
    }
  }
  let str = parts.join('  ');
  if (popCost > 0) str += `  ${popCost}👤`;
  return str;
}
