// BuildingsData — definicje budynków możliwych do postawienia na polach hex
//
// category: klucz zgodny z HexTile.allowedCategories
//   'mining' | 'energy' | 'food' | 'population' | 'research' | 'military' | 'space'
//
// rates: produkcja/konsumpcja surowców na rok gry (przed modyfikatorem terenu)
//   dodatnie = produkcja, ujemne = konsumpcja
//   Klucz 'research' będzie używany przez ResearchSystem (etap 8)
//
// terrainOnly: null = według category; tablica = tylko te typy terenu
// terrainAny:  true = gdziekolwiek buildable, bez sprawdzania category
//
// capacityBonus: jednorazowy przyrost pojemności magazynów po wybudowaniu
// housing:       jednorazowy przyrost miejsc mieszkalnych (przez civ:addHousing)
// buildTime:     czas budowy w latach gry (używany od etapu 7)
// requires:      id technologii wymaganej (null = brak, etap 8)

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
    buildTime:   0,
    rates:       { energy: -2 },     // utrzymanie
    housing:     4,                   // startowe miejsca mieszkalne
    popCost:     0,                   // nie wymaga POPów
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
    description: 'Wydobywa minerały z podłoża skalnego',
    cost:        { minerals: 60 },
    buildTime:   3,
    rates:       { minerals: 10, energy: -1 },
    housing:     0,
    popCost:     0.25,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  // ── Energia ───────────────────────────────────────────────────────────────

  solar_farm: {
    id:          'solar_farm',
    namePL:      'Elektrownia Słoneczna',
    category:    'energy',
    icon:        '☀',
    description: 'Zamienia promieniowanie gwiazdy w energię elektryczną',
    cost:        { minerals: 40 },
    buildTime:   2,
    rates:       { energy: 8 },
    housing:     0,
    popCost:     0.25,
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
    cost:        { minerals: 100 },
    buildTime:   5,
    rates:       { energy: 25 },
    housing:     0,
    popCost:     0.25,
    capacityBonus: null,
    terrainOnly: ['volcano'],   // tylko wulkany
    terrainAny:  false,
    requires:    null,
  },

  // ── Żywność / woda ────────────────────────────────────────────────────────

  farm: {
    id:          'farm',
    namePL:      'Farma',
    category:    'food',
    icon:        '🌾',
    description: 'Uprawy zapewniające organikę dla populacji',
    cost:        { minerals: 30, water: 20 },
    buildTime:   2,
    rates:       { organics: 10, water: -1 },
    housing:     0,
    popCost:     0.25,
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
    cost:        { minerals: 25 },
    buildTime:   1,
    rates:       { water: 6 },
    housing:     0,
    popCost:     0.25,
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
    cost:        { minerals: 80, energy: 20 },
    buildTime:   4,
    rates:       { energy: -3 },
    housing:     3,             // +3 POPy miejsca mieszkalne
    popCost:     0.25,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  // ── Logistyka ─────────────────────────────────────────────────────────────

  warehouse: {
    id:          'warehouse',
    namePL:      'Magazyn',
    category:    'mining',      // tolerowany przez większość terenów
    icon:        '🏗',
    description: 'Rozszerza pojemność magazynów (+200 każdego surowca)',
    cost:        { minerals: 50 },
    buildTime:   2,
    rates:       {},            // brak produkcji/konsumpcji
    housing:     0,
    popCost:     0.25,
    capacityBonus: { minerals: 200, energy: 200, organics: 200, water: 200 },
    terrainOnly: null,
    terrainAny:  true,          // można postawić na każdym buildable terenie
    requires:    null,
  },

  // ── Zaawansowane (wymagają technologii) ──────────────────────────────────

  smelter: {
    id:          'smelter',
    namePL:      'Huta',
    category:    'mining',
    icon:        '🏭',
    description: 'Przetwarza rudę na czyste metale — wysoka produkcja minerałów',
    cost:        { minerals: 120, energy: 40 },
    buildTime:   6,
    rates:       { minerals: 25, energy: -8 },
    housing:     0,
    popCost:     0.25,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    'deep_drilling',   // id technologii wymaganej
  },

  nuclear_plant: {
    id:          'nuclear_plant',
    namePL:      'Elektrownia Jądrowa',
    category:    'energy',
    icon:        '☢',
    description: 'Rozszczepienie atomu — ogromna produkcja energii',
    cost:        { minerals: 200, energy: 50 },
    buildTime:   10,
    rates:       { energy: 60, minerals: -2 },
    housing:     0,
    popCost:     0.5,           // złożona instalacja — wymaga więcej POPów
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    'nuclear_power',   // id technologii wymaganej
  },

  // ── Kosmos ────────────────────────────────────────────────────────────────

  launch_pad: {
    id:          'launch_pad',
    namePL:      'Wyrzutnia Rakietowa',
    category:    'mining',      // terrainAny=true — category tylko dla kolorowania panelu
    icon:        '🚀',
    description: 'Baza startowa ekspedycji kosmicznych — wymagana do każdej misji',
    cost:        { minerals: 300, energy: 150 },
    buildTime:   15,
    rates:       { energy: -10 },
    housing:     0,
    popCost:     0.5,           // złożona instalacja — wymaga więcej POPów
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,          // można postawić na każdym buildable terenie
    requires:    'rocketry',    // wymaga technologii Rakietnictwo
  },

  // ── Nauka ─────────────────────────────────────────────────────────────────

  research_station: {
    id:          'research_station',
    namePL:      'Stacja Badawcza',
    category:    'research',
    icon:        '🔬',
    description: 'Prowadzi badania naukowe — kosztowna, ale niezbędna',
    cost:        { minerals: 150, energy: 80 },
    buildTime:   6,
    rates:       { energy: -10, minerals: -2, research: 8 },
    housing:     0,
    popCost:     0.25,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  false,
    requires:    null,
  },

  // ── Stocznia (buduje statki kosmiczne) ───────────────────────────────────

  shipyard: {
    id:          'shipyard',
    namePL:      'Stocznia',
    category:    'space',
    icon:        '⚓',
    description: 'Buduje statki kosmiczne. Wymagana do produkcji floty.',
    cost:        { minerals: 200, energy: 100 },
    buildTime:   10,
    rates:       { energy: -5 },
    housing:     0,
    popCost:     0.5,
    capacityBonus: null,
    terrainOnly: null,
    terrainAny:  true,
    requires:    'exploration',
  },
};

// Ikony surowców — używane w panelach budynków i zasobów
export const RESOURCE_ICONS = {
  minerals: '⛏',
  energy:   '⚡',
  organics: '🌿',
  water:    '💧',
  research: '🔬',
  pop:      '👤',
};

// Formatuj stawki produkcji/konsumpcji jako czytelny string
// np. { minerals: 10, energy: -1 } → "+10⛏  -1⚡"
export function formatRates(rates) {
  return Object.entries(rates)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}${RESOURCE_ICONS[k] ?? k}`)
    .join('  ');
}

// Formatuj koszt jako czytelny string
// np. { minerals: 60 } → "60⛏", z opcjonalnym kosztem POP: "60⛏  0.25👤"
export function formatCost(cost, popCost = 0) {
  let str = Object.entries(cost)
    .map(([k, v]) => `${v}${RESOURCE_ICONS[k] ?? k}`)
    .join('  ');
  if (popCost > 0) str += `  ${popCost}👤`;
  return str;
}
