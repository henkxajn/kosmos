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
    commodityCost: {},
    energyCost:  2,
    buildTime:   0,
    rates:       {},
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
    commodityCost: { steel_plates: 2, mining_drills: 1 },
    energyCost:  2,
    buildTime:   3,
    rates:       {},       // produkcja obliczana dynamicznie z deposits
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
    cost:        { Si: 15, Cu: 5 },
    commodityCost: { steel_plates: 2, power_cells: 1 },
    energyCost:  0,
    buildTime:   2,
    rates:       { energy: 8 },
    housing:     0,
    popCost:     0.25,
    maxLevel:    10,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  geothermal: {
    id:          'geothermal',
    namePL:      'Elektrownia Geotermalna',
    category:    'energy',
    icon:        '♨',
    description: 'Wykorzystuje ciepło magmy — olbrzymia wydajność',
    cost:        { Fe: 30, Ti: 5 },
    commodityCost: { steel_plates: 3 },
    energyCost:  0,
    buildTime:   5,
    rates:       { energy: 25 },
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
    commodityCost: { steel_plates: 1 },
    energyCost:  1,
    buildTime:   2,
    rates:       { food: 10 },
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
    commodityCost: { steel_plates: 1 },
    energyCost:  1,
    buildTime:   1,
    rates:       { water: 6 },
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
    commodityCost: { steel_plates: 3 },
    energyCost:  3,
    buildTime:   4,
    rates:       {},
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
    cost:        { Si: 30, Cu: 15 },
    commodityCost: { steel_plates: 3, electronics: 2 },
    energyCost:  10,
    buildTime:   6,
    rates:       { research: 8 },
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
    commodityCost: { steel_plates: 4 },
    energyCost:  5,
    buildTime:   6,
    rates:       {},       // produkcja via FactorySystem, nie rates
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
    commodityCost: { steel_plates: 3, power_cells: 1 },
    energyCost:  8,
    buildTime:   6,
    rates:       {},       // bonus do kopalni (przetwarzanie)
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
    commodityCost: { steel_plates: 5, electronics: 3 },
    energyCost:  0,
    buildTime:   10,
    rates:       { energy: 60 },
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
    namePL:      'Wyrzutnia Rakietowa',
    category:    'mining',
    icon:        '🚀',
    description: 'Baza startowa ekspedycji kosmicznych',
    cost:        { Fe: 60, Ti: 30, Cu: 15 },
    commodityCost: { steel_plates: 5, hull_armor: 3, electronics: 2 },
    energyCost:  10,
    buildTime:   15,
    rates:       {},
    housing:     0,
    popCost:     0.5,
    maxLevel:    5,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    'rocketry',
  },

  // ── Stocznia ──────────────────────────────────────────────────────────────

  shipyard: {
    id:          'shipyard',
    namePL:      'Stocznia',
    category:    'space',
    icon:        '⚓',
    description: 'Buduje statki kosmiczne. Każdy poziom = 1 dodatkowy slot budowy.',
    cost:        { Fe: 80, Ti: 30, Cu: 20 },
    commodityCost: { steel_plates: 8, hull_armor: 5, power_cells: 3 },
    energyCost:  5,
    buildTime:   10,
    rates:       {},
    housing:     0,
    popCost:     0.5,
    maxLevel:    5,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    'exploration',
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
