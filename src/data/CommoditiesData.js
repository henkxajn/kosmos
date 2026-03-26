// CommoditiesData — definicje 21 towarów wytwarzanych w fabrykach
//
// Towary (commodities) = produkty przetworzone z surowców wydobywalnych.
// Wymagane do budowy zaawansowanych budynków i statków.
//
// Tier:       1–5 (wyższy = droższy)
// Recipe:     { resourceId: ilość } — surowce/towary zużywane na 1 sztukę
// BaseTime:   lata gry na 1 sztukę przy 1 punkcie produkcji
// Weight:     tony na sztukę (do cargo capacity statków)

import { MINED_RESOURCES, HARVESTED_RESOURCES } from './ResourcesData.js';

export const COMMODITIES = {

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 1 — Materiały Strukturalne
  // ══════════════════════════════════════════════════════════════════════════

  structural_alloys: {
    id:          'structural_alloys',
    namePL:      'Stopy Konstrukcyjne',
    nameEN:      'Structural Alloys',
    icon:        '🔧',
    tier:        1,
    recipe:      { Fe: 8, C: 4 },
    baseTime:    0.20,
    weight:      3.5,
    description: 'Walcowana stal konstrukcyjna wzmacniana węglem. ' +
                 'Fundament każdego budynku i każdej kolonii.',
    isConsumerGood: false, consumptionLayer: null,
  },

  polymer_composites: {
    id:          'polymer_composites',
    namePL:      'Kompozyty Polimerowe',
    nameEN:      'Polymer Composites',
    icon:        '🧪',
    tier:        1,
    recipe:      { C: 10, Si: 4 },
    baseTime:    0.20,
    weight:      1.5,
    description: 'Lekkie materiały węglowo-krzemowe do kadłubów statków ' +
                 'i izolacji termicznej.',
    isConsumerGood: false, consumptionLayer: null,
  },

  conductor_bundles: {
    id:          'conductor_bundles',
    namePL:      'Wiązki Przewodzące',
    nameEN:      'Conductor Bundles',
    icon:        '🔌',
    tier:        1,
    recipe:      { Cu: 8, C: 2 },
    baseTime:    0.15,
    weight:      1.5,
    description: 'Ekranowane wiązki kabli i magistrali danych. ' +
                 'Bez nich energia stoi w miejscu.',
    isConsumerGood: false, consumptionLayer: null,
  },

  extraction_systems: {
    id:          'extraction_systems',
    namePL:      'Systemy Wydobywcze',
    nameEN:      'Extraction Systems',
    icon:        '⛏',
    tier:        1,
    recipe:      { Fe: 6, C: 6, Hv: 2 },
    baseTime:    0.25,
    weight:      4.0,
    description: 'Zestawy wierteł, sond sejsmicznych i separatorów mineralnych. ' +
                 'Pierwszy krok do każdego wydobycia.',
    isConsumerGood: false, consumptionLayer: null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 2 — Komponenty Zaawansowane
  // ══════════════════════════════════════════════════════════════════════════

  power_cells: {
    id:          'power_cells',
    namePL:      'Ogniwa Energetyczne',
    nameEN:      'Power Cells',
    icon:        '🔋',
    tier:        2,
    recipe:      { Li: 6, Cu: 4, Si: 2 },
    baseTime:    0.375,
    weight:      2.0,
    description: 'Litowo-miedziowe ogniwa wysokiej gęstości energetycznej. ' +
                 'Paliwo statków Gen I i zasilanie budynków autonomicznych.',
    isConsumerGood: false, consumptionLayer: null,
  },

  pressure_modules: {
    id:          'pressure_modules',
    namePL:      'Moduły Presuryzacyjne',
    nameEN:      'Pressure Modules',
    icon:        '🏗',
    tier:        2,
    recipe:      { Ti: 6, Fe: 4, Si: 4, Cu: 2 },
    baseTime:    0.50,
    weight:      6.0,
    description: 'Ciśnieniowe moduły mieszkalne z zintegrowanym recyklingiem wody. ' +
                 'W próżni oddzielają żywych od martwych.',
    isConsumerGood: false, consumptionLayer: null,
  },

  electronic_systems: {
    id:          'electronic_systems',
    namePL:      'Układy Elektroniczne',
    nameEN:      'Electronic Systems',
    icon:        '💻',
    tier:        2,
    recipe:      { Si: 8, Cu: 5, C: 2 },
    baseTime:    0.375,
    weight:      1.0,
    description: 'Sterowniki, układy scalone i systemy sensoryczne do zarządzania ' +
                 'budynkami, statkami i infrastrukturą kolonii.',
    isConsumerGood: false, consumptionLayer: null,
  },

  reactive_armor: {
    id:          'reactive_armor',
    namePL:      'Pancerz Reaktywny',
    nameEN:      'Reactive Armor',
    icon:        '🛡',
    tier:        2,
    recipe:      { Ti: 7, Fe: 5, Hv: 3 },
    baseTime:    0.375,
    weight:      5.0,
    description: 'Wielowarstwowy pancerz tytanowo-wolframowy z aktywną absorpcją uderzeń. ' +
                 'Chroni kadłuby statków i budynki obronne.',
    isConsumerGood: false, consumptionLayer: null,
  },

  compact_bioreactor: {
    id:          'compact_bioreactor',
    namePL:      'Bioreaktor Kompaktowy',
    nameEN:      'Compact Bioreactor',
    icon:        '🧬',
    tier:        2,
    recipe:      { C: 8, water: 3, Cu: 3, Li: 1 },
    baseTime:    0.375,
    weight:      2.5,
    description: 'Zamknięty system syntezy żywności i recyklingu biologicznego. ' +
                 'Na księżycach bez gleby i powietrza to jedyna droga do jedzenia.',
    isConsumerGood: false, consumptionLayer: null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 3 — Technologia Zaawansowana
  // ══════════════════════════════════════════════════════════════════════════

  android_worker: {
    id:          'android_worker',
    namePL:      'Android Robotniczy',
    nameEN:      'Android Worker',
    icon:        '🤖',
    tier:        3,
    recipe:      { Fe: 8, Cu: 6, Si: 5, electronic_systems: 5, semiconductor_arrays: 3, polymer_composites: 2 },
    baseTime:    2.5,
    weight:      5.0,
    isDroidUnit:      true,
    droidTier:        2,
    efficiencyBonus:  0.70,   // +70% wydajności budynku, zajmuje pełny slot POP
    requiresTech:     'android_engineering',
    description: 'Humanoidalny android zdolny do złożonej pracy. ' +
                 'Zajmuje pełny slot POP ale wydajność przekracza ludzką o 70%.',
    isConsumerGood: false, consumptionLayer: null,
  },

  plasma_cores: {
    id:          'plasma_cores',
    namePL:      'Rdzenie Plazmatyczne',
    nameEN:      'Plasma Cores',
    icon:        '🔆',
    tier:        3,
    recipe:      { Ti: 8, Hv: 6, Li: 4 },
    baseTime:    2.0,
    weight:      4.0,
    requiresTech: 'nuclear_power',
    description: 'Reaktory plazmowe w skali przemysłowej. ' +
                 'Serce elektrowni jądrowych i napędów statków Gen III.',
    isConsumerGood: false, consumptionLayer: null,
  },

  semiconductor_arrays: {
    id:          'semiconductor_arrays',
    namePL:      'Układy Półprzewodnikowe',
    nameEN:      'Semiconductor Arrays',
    icon:        '🔬',
    tier:        3,
    recipe:      { Si: 10, Cu: 4, Hv: 2, Xe: 1 },
    baseTime:    3.0,
    weight:      0.5,
    requiresTech: 'basic_computing',
    description: 'Ultra-czyste kryształy półprzewodnikowe produkowane w próżni. ' +
                 'Bez nich nie ma zaawansowanej elektroniki ani AI.',
    isConsumerGood: false, consumptionLayer: null,
  },

  propulsion_systems: {
    id:          'propulsion_systems',
    namePL:      'Systemy Napędowe',
    nameEN:      'Propulsion Systems',
    icon:        '🚀',
    tier:        3,
    recipe:      { Ti: 6, Xe: 4, Hv: 3, Cu: 4, Li: 2 },
    baseTime:    3.0,
    weight:      3.0,
    requiresTech: 'ion_drives',
    description: 'Jonowe i plazmowe silniki do statków dalekiego zasięgu. ' +
                 'Bez nich galaktyka kończy się za rogiem.',
    isConsumerGood: false, consumptionLayer: null,
  },

  quantum_processors: {
    id:          'quantum_processors',
    namePL:      'Procesory Kwantowe',
    nameEN:      'Quantum Processors',
    icon:        '⚛',
    tier:        3,
    recipe:      { Si: 8, Hv: 4, Xe: 3, Nt: 2 },
    baseTime:    4.0,
    weight:      0.5,
    requiresTech: 'quantum_computing',
    description: 'Procesory kwantowe na bazie qbitów krzemowych. ' +
                 'Klucz do sztucznej inteligencji i nawigacji warp.',
    isConsumerGood: false, consumptionLayer: null,
  },

  metamaterials: {
    id:          'metamaterials',
    namePL:      'Metamateriały',
    nameEN:      'Metamaterials',
    icon:        '✨',
    tier:        3,
    recipe:      { Ti: 6, Hv: 5, Xe: 2, Si: 4 },
    baseTime:    3.0,
    weight:      2.5,
    requiresTech: 'exotic_materials',
    description: 'Stopy o właściwościach niemożliwych w naturze — ' +
                 'ujemny współczynnik załamania, zerowa rezystancja. ' +
                 'Statki Gen IV i bramy skokowe są z nich zbudowane.',
    isConsumerGood: false, consumptionLayer: null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 4 — Technologia Przełomowa
  // ══════════════════════════════════════════════════════════════════════════

  quantum_cores: {
    id:          'quantum_cores',
    namePL:      'Rdzenie Kwantowe',
    nameEN:      'Quantum Cores',
    icon:        '🌟',
    tier:        4,
    recipe:      { Si: 6, Nt: 4, Hv: 4, Xe: 3, Ti: 2, Li: 2 },
    baseTime:    8.0,
    weight:      1.0,
    requiresTech: 'quantum_computing',
    description: 'Procesory następnej generacji — qbity utrzymują koherencję latami. ' +
                 'Każdy kosztuje dziesięć lat wysiłku cywilizacji.',
    isConsumerGood: false, consumptionLayer: null,
  },

  antimatter_cells: {
    id:          'antimatter_cells',
    namePL:      'Ogniwa Antymaterii',
    nameEN:      'Antimatter Cells',
    icon:        '☢',
    tier:        4,
    recipe:      { Nt: 4, Xe: 4, Hv: 3, Li: 2 },
    baseTime:    8.0,
    weight:      0.5,
    requiresTech: 'antimatter_containment',
    description: 'Magnetyczne pułapki utrzymujące antymaterię w separacji od materii. ' +
                 'Jeden błąd w polu magnetycznym — i nie ma niczego w pobliżu.',
    isConsumerGood: false, consumptionLayer: null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TIER 5 — Endgame
  // ══════════════════════════════════════════════════════════════════════════

  warp_cores: {
    id:          'warp_cores',
    namePL:      'Rdzenie Warp',
    nameEN:      'Warp Cores',
    icon:        '🌀',
    tier:        5,
    recipe:      { quantum_cores: 2, antimatter_cells: 2, Ti: 8 },
    baseTime:    12.0,
    weight:      3.0,
    requiresTech: 'warp_drive',
    description: 'Zakrzywiacze czasoprzestrzeni w skali statkowej. ' +
                 'Kto je posiada, może dosięgnąć gwiazd.',
    isConsumerGood: false, consumptionLayer: null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DOBRA KONSUMPCYJNE (3 towary)
  // ══════════════════════════════════════════════════════════════════════════

  basic_supplies: {
    id:          'basic_supplies',
    namePL:      'Zaopatrzenie Bytowe',
    nameEN:      'Basic Supplies',
    icon:        '🔩',
    tier:        1,
    recipe:      { Fe: 3, C: 3, Cu: 1 },
    baseTime:    0.20,
    weight:      2.0,
    isConsumerGood: true, consumptionLayer: 'functioning',
    description: 'Filtry, leki, uszczelki, narzędzia. Wszystko co sprawia że kolonia ' +
                 'działa kolejny tydzień zamiast się rozpadać.',
  },

  civilian_goods: {
    id:          'civilian_goods',
    namePL:      'Dobra Cywilizacyjne',
    nameEN:      'Civilian Goods',
    icon:        '👕',
    tier:        1,
    recipe:      { C: 4, Si: 3, Li: 1 },
    baseTime:    0.25,
    weight:      1.5,
    isConsumerGood: true, consumptionLayer: 'comfort',
    description: 'Ubrania syntetyczne, komunikatory, przetworzona żywność. ' +
                 'Rzeczy które odróżniają kolonię od obozu przetrwania.',
  },

  neurostimulants: {
    id:          'neurostimulants',
    namePL:      'Neurostymulatory',
    nameEN:      'Neurostimulants',
    icon:        '💊',
    tier:        2,
    recipe:      { Li: 3, C: 2, water: 1 },
    baseTime:    0.30,
    weight:      0.5,
    isConsumerGood: true, consumptionLayer: 'luxury',
    requiresTech: 'hydroponics',
    description: 'Nootropiki, stabilizatory nastroju i suplementy kognitywne. ' +
                 'Izolacja kosmiczna robi coś z ludzkim umysłem — opóźniają to co nieodwracalne.',
    bonuses: {
      scientist_research: 0.05,   // +5% research dla Naukowców
      bureaucrat_loyalty: 0.10,   // +10% loyalty dla Urzędników
    },
  },
};

// ── Skrócone nazwy (PL) — do UI topbar ────────────────────────────────────
export const COMMODITY_SHORT = {};
for (const [id, def] of Object.entries(COMMODITIES)) {
  COMMODITY_SHORT[id] = def.namePL;
}

// ── Towary wg tierów — do menu produkcji ──────────────────────────────────
export const COMMODITY_BY_TIER = {};
for (const [id, def] of Object.entries(COMMODITIES)) {
  const t = def.tier;
  if (!COMMODITY_BY_TIER[t]) COMMODITY_BY_TIER[t] = [];
  COMMODITY_BY_TIER[t].push(id);
}

// ── Startowy stan magazynu towarów (nowa kolonia) ─────────────────────────
export const STARTING_COMMODITIES = {};
for (const id of Object.keys(COMMODITIES)) {
  STARTING_COMMODITIES[id] = 0;
}

// ── Pomocnik: formatuj recepturę jako string ──────────────────────────────
export function formatRecipe(recipe) {
  if (!recipe) return '';
  return Object.entries(recipe)
    .map(([id, qty]) => {
      // Sprawdź czy to surowiec
      const res = MINED_RESOURCES[id] || HARVESTED_RESOURCES[id];
      if (res) return `${res.symbol ?? id}×${qty}`;
      // Sprawdź czy to towar
      const com = COMMODITIES[id];
      if (com) return `${com.icon ?? id}×${qty}`;
      return `${id}×${qty}`;
    })
    .join(' ');
}
