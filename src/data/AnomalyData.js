// AnomalyData — definicje wszystkich anomalii w grze
//
// Każda anomalia ma: id, nazwę PL/EN, opis fabularny, kategorię,
// warunki wystąpienia, efekty i rzadkość.
//
// Dwuetapowe odkrywanie:
//   1) Survey (skan ogólny) — wykrywa OBECNOŚĆ anomalii w promieniu
//   2) Analyze (skan dokładny) — rover na hexie ujawnia TYP i aplikuje efekty
//
// Kategorie: geological, biological, alien, cosmic

export const ANOMALIES = {

  // ── GEOLOGICZNE ──────────────────────────────────────────────────────────

  neutronium_vein: {
    id:          'neutronium_vein',
    namePL:      'Żyła Neutronium',
    nameEN:      'Neutronium Vein',
    icon:        '⬡',
    category:    'geological',
    description: 'Skaner wykrył nienaturalnie gęstą żyłę minerału pod powierzchnią — analiza wykazała czysty neutronium, surowiec używany w zaawansowanych napędach kosmicznych.',
    rarity:      0.03,
    conditions: {
      terrains:    ['crater', 'mountains', 'wasteland'],
      planetTypes: ['hot_rocky', 'rocky'],
      minFe:       0.3,
    },
    effect: {
      type:     'one_time_resource',
      resource: 'Nt',
      amount:   3,
    },
    effectDescPL: '+3 Neutronium do zasobów kolonii',
    effectDescEN: '+3 Neutronium to colony stockpile',
  },

  heavy_metals_deposit: {
    id:          'heavy_metals_deposit',
    namePL:      'Złoże Metali Ciężkich',
    nameEN:      'Heavy Metals Deposit',
    icon:        '⛏',
    category:    'geological',
    description: 'Pod powierzchnią skaner wykrył skondensowaną warstwę wolframu i platyny — naturalne złoże ciężkich metali, które zwiększy wydajność wydobycia na tym hexie.',
    rarity:      0.06,
    conditions: {
      terrains:    ['mountains', 'crater', 'wasteland'],
      planetTypes: ['rocky', 'hot_rocky'],
    },
    effect: {
      type:            'tile_yield_bonus',
      miningBonus:     0.60,
      passiveResource: 'Hv',
      passiveAmount:   0.5,
    },
    effectDescPL: '+60% wydajność kopalni, +0.5 Hv/rok',
    effectDescEN: '+60% mine yield, +0.5 Hv/yr',
  },

  hollow_chamber: {
    id:          'hollow_chamber',
    namePL:      'Pusta Komora',
    nameEN:      'Hollow Chamber',
    icon:        '🕳',
    category:    'geological',
    description: 'Radar wgłębny wykrył rozległą komorę podziemną — naturalna jaskinia o stabilnych ścianach. Budowa fundamentów jest tu łatwiejsza, ale grunt może się osunąć.',
    rarity:      0.08,
    conditions: {
      terrains: ['plains', 'desert', 'tundra', 'wasteland'],
    },
    effect: {
      type:          'build_modifier',
      buildTimeMult: 0.60,
      collapseRisk:  0.02,
    },
    effectDescPL: 'Budowa -40% czasu, ryzyko osunięcia 2%/rok',
    effectDescEN: 'Build time -40%, 2%/yr collapse risk',
  },

  silicon_crystals: {
    id:          'silicon_crystals',
    namePL:      'Kryształy Krzemowe',
    nameEN:      'Silicon Crystal Formation',
    icon:        '💎',
    category:    'geological',
    description: 'Odkryto naturalnie uformowane kryształy krzemu o wyjątkowej czystości — idealne do produkcji półprzewodników. Hex generuje dodatkowy krzem co roku.',
    rarity:      0.08,
    conditions: {
      terrains: ['mountains', 'crater', 'desert'],
      minSi:    0.3,
    },
    effect: {
      type:     'passive_resource',
      resource: 'Si',
      amount:   2,
    },
    effectDescPL: '+2 Si/rok pasywnie',
    effectDescEN: '+2 Si/yr passive',
  },

  geothermal_field: {
    id:          'geothermal_field',
    namePL:      'Pole Geotermalne',
    nameEN:      'Geothermal Field',
    icon:        '🌋',
    category:    'geological',
    description: 'Potężne źródło energii geotermalnej — ciśnienie gorących gazów pod powierzchnią jest 4× powyżej normy. Elektrownia geotermalna zbudowana tutaj będzie produkować znacznie więcej energii.',
    rarity:      0.05,
    conditions: {
      terrains:    ['volcano', 'mountains'],
      planetTypes: ['hot_rocky', 'rocky'],
    },
    effect: {
      type:         'building_multiplier',
      buildingId:   'geothermal',
      multiplier:   2.5,
    },
    effectDescPL: 'Geotermia ×2.5 na tym hexie',
    effectDescEN: 'Geothermal ×2.5 on this hex',
  },

  ancient_fossils: {
    id:          'ancient_fossils',
    namePL:      'Skamieliny Pierwotne',
    nameEN:      'Ancient Fossils',
    icon:        '🦴',
    category:    'geological',
    description: 'Rover odkopał skamieniałości mikroorganizmów sprzed miliardów lat — jedyny dowód na prymitywne życie na tej planecie. Analiza dostarcza cennych danych naukowych.',
    rarity:      0.07,
    conditions: {
      terrains: ['plains', 'tundra', 'desert'],
      minLife:  1,
    },
    effect: {
      type:    'research_bonus',
      oneTime: 25,
    },
    effectDescPL: '+25 research jednorazowo',
    effectDescEN: '+25 research one-time',
  },

  // ── BIOLOGICZNE ──────────────────────────────────────────────────────────

  bioluminescent_depths: {
    id:          'bioluminescent_depths',
    namePL:      'Bioluminescencja Głębinowa',
    nameEN:      'Bioluminescent Depths',
    icon:        '🔵',
    category:    'biological',
    description: 'Pod powierzchnią lodu wykryto regularne impulsy światła — bioluminescencyjne organizmy głębinowe. Ich biochemia to przełom naukowy wart szczegółowej analizy.',
    rarity:      0.04,
    conditions: {
      terrains: ['ocean', 'ice_sheet'],
      minLife:  40,
    },
    effect: {
      type:    'research_bonus',
      oneTime: 40,
    },
    effectDescPL: '+40 research jednorazowo',
    effectDescEN: '+40 research one-time',
  },

  planetary_mycelium: {
    id:          'planetary_mycelium',
    namePL:      'Grzybnia Planetarna',
    nameEN:      'Planetary Mycelium',
    icon:        '🍄',
    category:    'biological',
    description: 'Podziemna sieć grzybni rozciąga się na setki kilometrów — jeden organizm pokrywający całą platformę. Jego symbiotyczne właściwości zwiększają urodzajność gleby na planecie.',
    rarity:      0.04,
    conditions: {
      terrains: ['forest', 'plains'],
      minLife:  70,
    },
    effect: {
      type:      'planet_modifier',
      foodBonus: 0.30,
    },
    effectDescPL: '+30% żywność na planecie',
    effectDescEN: '+30% food planet-wide',
  },

  toxic_spores: {
    id:          'toxic_spores',
    namePL:      'Toksyczne Spory',
    nameEN:      'Toxic Spore Field',
    icon:        '☣',
    category:    'biological',
    description: 'Rover wykrył chmurę toksycznych zarodników unoszących się nad gruntem. Analiza chemiczna ujawniła wysokie stężenie litu w tkankach roślinnych — cenny surowiec do odzysku.',
    rarity:      0.07,
    conditions: {
      terrains: ['forest', 'plains', 'tundra'],
      minLife:  20,
    },
    effect: {
      type:            'one_time_resource',
      resource:        'Li',
      amount:          5,
    },
    effectDescPL: '+5 Li jednorazowo',
    effectDescEN: '+5 Li one-time',
  },

  metallic_symbiosis: {
    id:          'metallic_symbiosis',
    namePL:      'Symbioza Metaliczna',
    nameEN:      'Metallic Symbiosis',
    icon:        '🧬',
    category:    'biological',
    description: 'Odkryto kolonie mikroorganizmów, które naturalnie koncentrują miedź i tytan w swoich tkankach. Kopalnia postawiona na tym hexie będzie miała znacznie wyższą wydajność dzięki biologicznemu wzbogacaniu rudy.',
    rarity:      0.05,
    conditions: {
      terrains: ['forest', 'plains'],
      minLife:  50,
    },
    effect: {
      type:        'tile_yield_bonus',
      miningBonus: 0.40,
    },
    effectDescPL: '+40% wydajność kopalni na hexie',
    effectDescEN: '+40% mine yield on this hex',
  },

  eternal_forest: {
    id:          'eternal_forest',
    namePL:      'Wieczny Las',
    nameEN:      'Eternal Forest',
    icon:        '🌳',
    category:    'biological',
    description: 'Rover odkrył drzewa liczące tysiące lat — ich DNA zawiera zapisy zmian klimatycznych planety. Analiza materiału genetycznego to kopalnia wiedzy naukowej.',
    rarity:      0.06,
    conditions: {
      terrains: ['forest'],
      minLife:  60,
    },
    effect: {
      type:    'research_bonus',
      oneTime: 50,
    },
    effectDescPL: '+50 research jednorazowo',
    effectDescEN: '+50 research one-time',
  },

  // ── ALIEN / TECHNOLOGICZNE ────────────────────────────────────────────────

  ancient_ruins: {
    id:          'ancient_ruins',
    namePL:      'Ruiny Poprzedników',
    nameEN:      'Precursor Ruins',
    icon:        '🏛',
    category:    'alien',
    description: 'Rover odkrył ruiny sztucznych konstrukcji — wyraźnie nie naturalnego pochodzenia. Architektura jest obca, materiały nieznane. Szczegółowa analiza przynosi ogromny skok wiedzy naukowej.',
    rarity:      0.02,
    conditions: {
      terrains: ['plains', 'desert', 'tundra', 'wasteland', 'crater'],
    },
    effect: {
      type:    'research_bonus',
      oneTime: 100,
    },
    effectDescPL: '+100 research jednorazowo',
    effectDescEN: '+100 research one-time',
  },

  regular_signal: {
    id:          'regular_signal',
    namePL:      'Sygnał Regularny',
    nameEN:      'Regular Signal',
    icon:        '📡',
    category:    'alien',
    description: 'Rover zarejestrował powtarzający się sygnał radiowy emitowany co 27.3 sekundy z wnętrza skały. Źródło jest sztuczne — dekodowanie sygnału dostarcza zaawansowanej wiedzy technicznej.',
    rarity:      0.02,
    conditions: {
      terrains: ['plains', 'mountains', 'crater', 'wasteland'],
    },
    effect: {
      type:    'research_bonus',
      oneTime: 75,
    },
    effectDescPL: '+75 research jednorazowo',
    effectDescEN: '+75 research one-time',
  },

  magnetic_anomaly: {
    id:          'magnetic_anomaly',
    namePL:      'Pole Magnetyczne Anomalne',
    nameEN:      'Magnetic Anomaly',
    icon:        '🧲',
    category:    'alien',
    description: 'Silne zaburzenie pola magnetycznego w tym regionie — kompasy wirują, elektronika działa wolniej. Badanie źródła anomalii dostarcza nowych danych o fizyce planetarnej.',
    rarity:      0.05,
    conditions: {
      terrains: ['plains', 'mountains', 'crater'],
    },
    effect: {
      type:    'research_bonus',
      oneTime: 30,
    },
    effectDescPL: '+30 research jednorazowo',
    effectDescEN: '+30 research one-time',
  },

  xenon_deposit: {
    id:          'xenon_deposit',
    namePL:      'Złoże Ksenonu',
    nameEN:      'Xenon Pocket',
    icon:        '💨',
    category:    'alien',
    description: 'Rover wykrył podziemną kieszeń gazu ksenonu o stężeniu 8× powyżej normy planetarnej. Ksenon jest cennym surowcem do napędów jonowych — hex będzie go pasywnie dostarczał.',
    rarity:      0.05,
    conditions: {
      terrains: ['desert', 'wasteland', 'crater'],
    },
    effect: {
      type:     'passive_resource',
      resource: 'Xe',
      amount:   3,
    },
    effectDescPL: '+3 Xe/rok pasywnie',
    effectDescEN: '+3 Xe/yr passive',
  },

  monolith: {
    id:          'monolith',
    namePL:      'Monolit',
    nameEN:      'The Monolith',
    icon:        '⬛',
    category:    'alien',
    description: 'Rover odkrył idealnie gładki, czarny, kubiczny obiekt wystający z gruntu. Żaden znany proces geologiczny nie tworzy takich form. Interakcja z monolitem daje nieprzewidywalne rezultaty.',
    rarity:      0.015,
    conditions: {
      terrains: ['plains', 'desert', 'tundra', 'wasteland', 'mountains'],
    },
    effect: {
      type: 'random',
      options: [
        { weight: 0.30, type: 'research_bonus',      oneTime: 150 },
        { weight: 0.25, type: 'one_time_resource',    resource: 'Nt', amount: 5 },
        { weight: 0.25, type: 'one_time_resource',    resource: 'Hv', amount: 8 },
        { weight: 0.20, type: 'nothing' },
      ],
    },
    effectDescPL: 'Efekt losowy — może być wszystkim albo niczym',
    effectDescEN: 'Random effect — could be anything or nothing',
  },

  // ── KOSMICZNE / ORBITALNE ─────────────────────────────────────────────────

  lagrange_point: {
    id:          'lagrange_point',
    namePL:      'Punkt Lagrange\'a',
    nameEN:      'Lagrange Point',
    icon:        '🔭',
    category:    'cosmic',
    description: 'Ten punkt na powierzchni znajduje się w strefie neutralnej grawitacyjnie — idealny punkt równowagi między ciałami niebieskimi. Stocznia zbudowana tutaj zużywa mniej paliwa przy startach.',
    rarity:      0.04,
    conditions: {
      terrains: ['plains', 'desert', 'wasteland'],
    },
    effect: {
      type:        'building_multiplier',
      buildingId:  'shipyard',
      multiplier:  1.5,
    },
    effectDescPL: 'Stocznia ×1.5 na tym hexie',
    effectDescEN: 'Shipyard ×1.5 on this hex',
  },

  fresh_crater: {
    id:          'fresh_crater',
    namePL:      'Świeży Krater Impaktowy',
    nameEN:      'Fresh Impact Crater',
    icon:        '☄',
    category:    'cosmic',
    description: 'Rover zbadał stosunkowo świeży krater — materiał meteorytu nie zdążył wietrzeć. Zawiera cenne metale ciężkie i neutronium do natychmiastowego odzysku.',
    rarity:      0.07,
    conditions: {
      terrains: ['crater'],
    },
    effect: {
      type:              'combined',
      oneTimeResources:  { Hv: 5, Nt: 3 },
    },
    effectDescPL: '+5 Hv, +3 Nt jednorazowo',
    effectDescEN: '+5 Hv, +3 Nt one-time',
  },

  radiation_zone: {
    id:          'radiation_zone',
    namePL:      'Strefa Radiacyjna',
    nameEN:      'Radiation Zone',
    icon:        '☢',
    category:    'cosmic',
    description: 'Rover zmierzył promieniowanie jonizujące 40× powyżej normy planetarnej. Strefa niebezpieczna dla załogi, ale badanie źródła promieniowania dostarcza danych naukowych.',
    rarity:      0.06,
    conditions: {
      terrains: ['wasteland', 'crater', 'desert', 'mountains'],
    },
    effect: {
      type:    'research_bonus',
      oneTime: 20,
    },
    effectDescPL: '+20 research jednorazowo',
    effectDescEN: '+20 research one-time',
  },

  orbital_resonance: {
    id:          'orbital_resonance',
    namePL:      'Rezonans Orbitalny',
    nameEN:      'Orbital Resonance',
    icon:        '☀',
    category:    'cosmic',
    description: 'Rezonans orbitalny sprawia, że ten region jest stale nasłoneczniony — idealnie dla elektrowni słonecznych. Farma solarna postawiona tutaj produkuje 3× więcej energii.',
    rarity:      0.05,
    conditions: {
      terrains:    ['desert', 'plains', 'wasteland'],
      planetTypes: ['rocky', 'hot_rocky'],
    },
    effect: {
      type:        'building_multiplier',
      buildingId:  'solar_farm',
      multiplier:  3.0,
    },
    effectDescPL: 'Elektrownia słoneczna ×3 na tym hexie',
    effectDescEN: 'Solar farm ×3 on this hex',
  },
};

// Lista ID
export const ANOMALY_IDS = Object.keys(ANOMALIES);

// Mapowanie kategorii → kolor (do renderingu na globusie)
export const ANOMALY_CATEGORY_COLORS = {
  geological: [255, 200, 50],
  biological: [100, 220, 100],
  alien:      [100, 200, 255],
  cosmic:     [200, 150, 255],
};

// Filtruj anomalie pasujące do terenu i planety
export function getEligibleAnomalies(terrainType, planet) {
  const pType = planet?.planetType ?? 'rocky';
  const life  = planet?.lifeScore  ?? 0;
  const comp  = planet?.composition ?? {};

  return ANOMALY_IDS.filter(id => {
    const a = ANOMALIES[id];
    const c = a.conditions;
    if (c.terrains && !c.terrains.includes(terrainType)) return false;
    if (c.planetTypes && !c.planetTypes.includes(pType)) return false;
    if (c.minLife !== undefined && life < c.minLife) return false;
    if (c.minFe !== undefined && (comp.Fe ?? 0) < c.minFe) return false;
    if (c.minSi !== undefined && (comp.Si ?? 0) < c.minSi) return false;
    return true;
  });
}
