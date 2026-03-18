// TechData — definicje drzewa technologii (Etap 38 — Wielka Reforma)
//
// 7 gałęzi (branches):
//   mining    — wydobycie i metalurgia
//   energy    — energetyka
//   biology   — biologia i rolnictwo
//   civil     — administracja i budownictwo
//   space     — ekspansja kosmiczna
//   computing — informatyka i AI
//   defense   — obronność i osłony
//
// Każda technologia ma:
//   id:               unikalny string-klucz
//   namePL:           polska nazwa
//   branch:           gałąź (jeden z 7 kluczy powyżej)
//   tier:             1–5 (wyższy = droższy i mocniejszy)
//   cost:             { research: X } — koszt w punktach badań
//   requires:         [] — tablica prereqs; string = AND, [string,string] = OR
//   requiresDiscovery: string | null — ID odkrycia naukowego (soft-gate)
//   effects:          [] — lista efektów (patrz niżej)
//   description:      krótki opis PL
//
// Efekty (effects):
//   { type: 'modifier', resource, multiplier }
//   { type: 'unlockBuilding', buildingId }
//   { type: 'unlockShip', shipId }
//   { type: 'unlockFeature', feature }
//   { type: 'prosperityBonus', amount }
//   { type: 'popGrowthBonus', multiplier }
//   { type: 'consumptionMultiplier', resource, multiplier }
//   { type: 'shipSpeedMultiplier', multiplier }
//   { type: 'disasterReduction', amount }
//   { type: 'buildingLevelCap', maxLevel }
//   { type: 'terrainUnlock', terrain, categories }
//   { type: 'factorySpeedMultiplier', multiplier }
//   { type: 'buildTimeMultiplier', multiplier }
//   { type: 'autonomousEfficiency', multiplier }
//   { type: 'fuelEfficiency', multiplier }
//   { type: 'shipSurvival', amount }
//   { type: 'unlockCommodity', commodityId }
//   { type: 'researchCostMultiplier', multiplier }
//   { type: 'allBuildingsAutonomous' }
//
// OR prerequisites:
//   requires: ['rocketry', ['ion_drives','plasma_drives'], 'fusion_power']
//   → rocketry AND (ion_drives OR plasma_drives) AND fusion_power

export const TECH_BRANCHES = {
  mining:    { namePL: 'Wydobycie',    icon: '⛏', color: '#c8a870' },
  energy:    { namePL: 'Energia',      icon: '⚡', color: '#88ddff' },
  biology:   { namePL: 'Biologia',     icon: '🌿', color: '#88dd88' },
  civil:     { namePL: 'Budownictwo',  icon: '🏗', color: '#ddaacc' },
  space:     { namePL: 'Kosmos',       icon: '🚀', color: '#aaaaff' },
  computing: { namePL: 'Informatyka',  icon: '💻', color: '#ffcc66' },
  defense:   { namePL: 'Obronność',    icon: '🛡', color: '#ff8888' },
};

export const TECHS = {

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: WYDOBYCIE (mining) ⛏ — 8 tech ──────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  metallurgy: {
    id:          'metallurgy',
    namePL:      'Metalurgia',
    branch:      'mining',
    tier:        1,
    cost:        { research: 50 },
    requires:    [],
    effects: [
      { type: 'unlockBuilding', buildingId: 'factory' },
      { type: 'unlockBuilding', buildingId: 'consumer_factory' },
    ],
    description: 'Wytop metali i produkcja komponentów — odblokowanie Fabryki',
  },

  advanced_mining: {
    id:          'advanced_mining',
    namePL:      'Zaawansowane Wydobycie',
    branch:      'mining',
    tier:        1,
    cost:        { research: 90 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'minerals', multiplier: 1.2 },
      { type: 'terrainUnlock', terrain: 'desert', categories: ['mining'] },
      { type: 'terrainUnlock', terrain: 'tundra', categories: ['mining'] },
    ],
    description: 'Kopalnie na pustyni i tundrze — +20% minerałów, nowe tereny wydobycia',
  },

  deep_drilling: {
    id:          'deep_drilling',
    namePL:      'Głębokie Wiercenia',
    branch:      'mining',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['advanced_mining'],
    effects: [
      { type: 'modifier', resource: 'minerals', multiplier: 1.3 },
      { type: 'unlockBuilding', buildingId: 'smelter' },
      { type: 'buildingLevelCap', maxLevel: 7 },
    ],
    description: 'Wydobycie z głębin + Huta — +30% minerałów, max level 7',
  },

  advanced_materials: {
    id:          'advanced_materials',
    namePL:      'Zaawansowane Materiały',
    branch:      'mining',
    tier:        2,
    cost:        { research: 150 },
    requires:    ['metallurgy'],
    effects: [
      { type: 'unlockCommodity', commodityId: 'composite_alloy' },
    ],
    description: 'Nowy stop kompozytowy (Ti+Fe+Cu) — potrzebny do statków Gen II',
  },

  rare_earth_processing: {
    id:          'rare_earth_processing',
    namePL:      'Przetwarzanie Ziem Rzadkich',
    branch:      'mining',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['advanced_mining'],
    effects: [
      { type: 'unlockFeature', feature: 'rare_earth_mining' },
    ],
    description: 'Ekspedycje mining zwracają rzadkie metale (Pt, W, Li)',
  },

  space_mining: {
    id:          'space_mining',
    namePL:      'Górnictwo Kosmiczne',
    branch:      'mining',
    tier:        3,
    cost:        { research: 250 },
    requires:    ['rocketry', 'deep_drilling'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'orbital_mine' },
      { type: 'buildingLevelCap', maxLevel: 10 },
    ],
    description: 'Kopalnia Orbitalna — automatyczne wydobycie z planetoidów bez POPów',
  },

  exotic_materials: {
    id:          'exotic_materials',
    namePL:      'Materiały Egzotyczne',
    branch:      'mining',
    tier:        3,
    cost:        { research: 350 },
    requires:    ['advanced_materials', 'space_mining'],
    effects: [
      { type: 'unlockCommodity', commodityId: 'exotic_alloy' },
    ],
    description: 'Nowy stop egzotyczny (Ti+W+Pt+Xe) — prereq do budynków T4+ i statków Gen III+',
  },

  nanofabrication: {
    id:          'nanofabrication',
    namePL:      'Nanofabrykacja',
    branch:      'mining',
    tier:        4,
    cost:        { research: 500 },
    requires:    ['exotic_materials', 'quantum_computing'],
    requiresDiscovery: 'anomalia_kwantowa',
    effects: [
      { type: 'factorySpeedMultiplier', multiplier: 2.0 },
      { type: 'unlockCommodity', commodityId: 'nanotech_filters' },
    ],
    description: 'Fabryki produkują ×2 szybciej. Odblokowanie filtrów nanotechnologicznych',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: ENERGIA (energy) ⚡ — 7 tech ────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  efficient_solar: {
    id:          'efficient_solar',
    namePL:      'Wydajne Panele Słoneczne',
    branch:      'energy',
    tier:        1,
    cost:        { research: 70 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'energy', multiplier: 1.2 },
    ],
    description: 'Nowa generacja ogniw fotowoltaicznych — +20% energii',
  },

  battery_tech: {
    id:          'battery_tech',
    namePL:      'Technologia Akumulatorów',
    branch:      'energy',
    tier:        1,
    cost:        { research: 60 },
    requires:    [],
    effects: [
      { type: 'unlockCommodity', commodityId: 'power_cells_mk2' },
    ],
    description: 'Nowe ogniwa mk2 — 2× pojemność, statki lecą dalej na jednym tankowaniu',
  },

  nuclear_power: {
    id:          'nuclear_power',
    namePL:      'Energetyka Jądrowa',
    branch:      'energy',
    tier:        2,
    cost:        { research: 220 },
    requires:    ['efficient_solar'],
    effects: [
      { type: 'modifier', resource: 'energy', multiplier: 1.4 },
      { type: 'unlockBuilding', buildingId: 'nuclear_plant' },
      { type: 'terrainUnlock', terrain: 'ice_sheet', categories: ['energy', 'population'] },
    ],
    description: 'Elektrownia Jądrowa + budowa na lodowcu (ciepło reaktora)',
  },

  plasma_physics: {
    id:          'plasma_physics',
    namePL:      'Fizyka Plazmy',
    branch:      'energy',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['efficient_solar'],
    effects: [
      { type: 'terrainUnlock', terrain: 'volcano', categories: ['mining'] },
    ],
    description: 'Budowa fabryk na wulkanach — plazma stabilizuje pracę w ekstremalnym cieple',
  },

  fusion_power: {
    id:          'fusion_power',
    namePL:      'Energia Fuzji',
    branch:      'energy',
    tier:        3,
    cost:        { research: 400 },
    requires:    ['nuclear_power', 'plasma_physics'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'fusion_reactor' },
      { type: 'modifier', resource: 'energy', multiplier: 1.5 },
    ],
    description: 'Reaktor Fuzyjny (100 energii) — kolonie niezależne od gwiazdy',
  },

  antimatter_containment: {
    id:          'antimatter_containment',
    namePL:      'Utrzymanie Antymaterii',
    branch:      'energy',
    tier:        4,
    cost:        { research: 600 },
    requires:    ['fusion_power', 'quantum_physics'],
    requiresDiscovery: 'pulapka_antymaterii',
    effects: [
      { type: 'unlockCommodity', commodityId: 'antimatter_cells' },
      { type: 'unlockBuilding', buildingId: 'antimatter_factory' },
    ],
    description: 'Fabryka Antymaterii — paliwo Gen IV, pochłania ogromnie energii',
  },

  zero_point_energy: {
    id:          'zero_point_energy',
    namePL:      'Energia Próżni',
    branch:      'energy',
    tier:        5,
    cost:        { research: 1200 },
    requires:    ['antimatter_containment'],
    requiresDiscovery: 'fluktuacje_kwantowe',
    effects: [
      { type: 'unlockBuilding', buildingId: 'vacuum_generator' },
    ],
    description: 'Generator Próżni (500 energii, 0 paliwa) — rewolucja energetyczna',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: BIOLOGIA (biology) 🌿 — 7 tech ─────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  hydroponics: {
    id:          'hydroponics',
    namePL:      'Hydroponika',
    branch:      'biology',
    tier:        1,
    cost:        { research: 60 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'food', multiplier: 1.25 },
      { type: 'terrainUnlock', terrain: 'tundra', categories: ['food'] },
      { type: 'terrainUnlock', terrain: 'desert', categories: ['food'] },
    ],
    description: 'Farmy na tundrze i pustyni — +25% żywności (szklarnie hydroponiczne)',
  },

  bio_recycling: {
    id:          'bio_recycling',
    namePL:      'Biorecykling',
    branch:      'biology',
    tier:        1,
    cost:        { research: 50 },
    requires:    [],
    effects: [
      { type: 'consumptionMultiplier', resource: 'food', multiplier: 0.8 },
    ],
    description: 'POPy zużywają -20% food — zamknięty obieg organiczny',
  },

  genetic_engineering: {
    id:          'genetic_engineering',
    namePL:      'Inżynieria Genetyczna',
    branch:      'biology',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['hydroponics'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'genetics_lab' },
      { type: 'unlockCommodity', commodityId: 'bio_samples' },
      { type: 'popGrowthBonus', multiplier: 1.3 },
    ],
    description: 'Laboratorium Genetyczne + bio_samples + wzrost POPów ×1.3',
  },

  medicine: {
    id:          'medicine',
    namePL:      'Zaawansowana Medycyna',
    branch:      'biology',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['bio_recycling'],
    effects: [
      { type: 'prosperityBonus', amount: 5 },
      { type: 'popGrowthBonus', multiplier: 1.1 },
    ],
    description: 'POPy odporniejsze na głód + dobrobyt +5',
  },

  food_synthesis: {
    id:          'food_synthesis',
    namePL:      'Synteza Żywności',
    branch:      'biology',
    tier:        3,
    cost:        { research: 350 },
    requires:    ['genetic_engineering'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'synthesized_food_plant' },
      { type: 'modifier', resource: 'food', multiplier: 1.2 },
    ],
    description: 'Zakład Syntetycznej Żywności — food na ciałach bez gleby',
  },

  cryogenics: {
    id:          'cryogenics',
    namePL:      'Kriogenika',
    branch:      'biology',
    tier:        3,
    cost:        { research: 300 },
    requires:    ['medicine'],
    requiresDiscovery: 'extremofil_lodowy',
    effects: [
      { type: 'unlockShip', shipId: 'heavy_colony_ship' },
    ],
    description: 'Hibernacja załóg — Heavy Colony Ship (5 POPów, 500t cargo)',
  },

  terraforming: {
    id:          'terraforming',
    namePL:      'Terraformacja',
    branch:      'biology',
    tier:        4,
    cost:        { research: 500 },
    requires:    ['food_synthesis', 'colonization'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'terraformer' },
    ],
    description: 'Przekształcanie atmosfer planet — odblokowanie Terraformera',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: BUDOWNICTWO (civil) 🏗 — 7 tech ────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  urban_planning: {
    id:          'urban_planning',
    namePL:      'Planowanie Urbanistyczne',
    branch:      'civil',
    tier:        1,
    cost:        { research: 80 },
    requires:    [],
    effects: [
      { type: 'prosperityBonus', amount: 3 },
      { type: 'unlockFeature', feature: 'adjacency_bonus' },
    ],
    description: 'Budynki sąsiadujące z tym samym typem +10% bonus (adjacency)',
  },

  automation: {
    id:          'automation',
    namePL:      'Automatyzacja',
    branch:      'civil',
    tier:        1,
    cost:        { research: 100 },
    requires:    [],
    effects: [
      { type: 'unlockBuilding', buildingId: 'autonomous_mine' },
      { type: 'unlockBuilding', buildingId: 'autonomous_solar_farm' },
      { type: 'unlockBuilding', buildingId: 'autonomous_spaceport' },
    ],
    description: 'Odblokowanie budynków autonomicznych (kopalnia/elektrownia/port bez POPów)',
  },

  arcology: {
    id:          'arcology',
    namePL:      'Arkologie',
    branch:      'civil',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['urban_planning'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'arcology_building' },
      { type: 'prosperityBonus', amount: 5 },
      { type: 'consumptionMultiplier', resource: 'food', multiplier: 0.90 },
    ],
    description: 'Arkologia (housing 8 + food 5) — samowystarczalny megablok',
  },

  bureaucracy: {
    id:          'bureaucracy',
    namePL:      'Biurokracja',
    branch:      'civil',
    tier:        2,
    cost:        { research: 120 },
    requires:    ['urban_planning'],
    effects: [
      { type: 'unlockFeature', feature: 'empire_management' },
    ],
    description: 'Panel Zarządzanie Imperium — widok wszystkich kolonii, globalne priorytety',
  },

  interplanetary_logistics: {
    id:          'interplanetary_logistics',
    namePL:      'Logistyka Międzyplanetarna',
    branch:      'civil',
    tier:        3,
    cost:        { research: 250 },
    requires:    ['colonization', 'bureaucracy'],
    effects: [
      { type: 'unlockFeature', feature: 'trade_routes' },
      { type: 'unlockShip', shipId: 'heavy_freighter' },
    ],
    description: 'Trasy handlowe + Ciężki Frachtowiec (10k cargo)',
  },

  emergency_protocols: {
    id:          'emergency_protocols',
    namePL:      'Protokoły Awaryjne',
    branch:      'civil',
    tier:        3,
    cost:        { research: 280 },
    requires:    ['advanced_navigation', 'arcology'],
    effects: [
      { type: 'shipSurvival', amount: 1.0 },
    ],
    description: 'Katastrofa nie niszczy statku — wraca uszkodzony (50% prędkości, naprawa 1 rok)',
  },

  megastructures: {
    id:          'megastructures',
    namePL:      'Megastruktury',
    branch:      'civil',
    tier:        5,
    cost:        { research: 1000 },
    requires:    ['arcology', 'nanofabrication'],
    requiresDiscovery: 'rezonans_grawitacyjny',
    effects: [
      { type: 'unlockBuilding', buildingId: 'orbital_habitat' },
    ],
    description: 'Habitat Orbitalny (housing 20, nie zajmuje hexa, limit 3)',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: KOSMOS (space) 🚀 — 12 tech ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  orbital_survey: {
    id:          'orbital_survey',
    namePL:      'Kartografia Orbitalna',
    branch:      'space',
    tier:        1,
    cost:        { research: 110 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'research', multiplier: 1.4 },
      { type: 'unlockBuilding', buildingId: 'observatory' },
    ],
    description: 'Katalog ciał pokazuje składy i złoża + Obserwatorium (research 12)',
  },

  rocketry: {
    id:          'rocketry',
    namePL:      'Rakietnictwo',
    branch:      'space',
    tier:        2,
    cost:        { research: 300 },
    requires:    ['orbital_survey'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'launch_pad' },
    ],
    description: 'Port Kosmiczny + misje — gateway do lotów kosmicznych',
  },

  advanced_navigation: {
    id:          'advanced_navigation',
    namePL:      'Zaawansowana Nawigacja',
    branch:      'space',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['rocketry'],
    effects: [
      { type: 'disasterReduction', amount: 0.5 },
    ],
    description: 'Statki mogą lecieć przez strefę Słońca — −0.5% ryzyko katastrofy',
  },

  exploration: {
    id:          'exploration',
    namePL:      'Eksploracja',
    branch:      'space',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['rocketry'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'shipyard' },
      { type: 'unlockShip', shipId: 'science_vessel' },
    ],
    description: 'Stocznia + Statek Naukowy Gen I — zwiad i misje naukowe',
  },

  colonization: {
    id:          'colonization',
    namePL:      'Kolonizacja',
    branch:      'space',
    tier:        3,
    cost:        { research: 300 },
    requires:    ['exploration'],
    effects: [
      { type: 'unlockShip', shipId: 'colony_ship' },
    ],
    description: 'Statek Kolonijny — zakładanie osad na zbadanych ciałach',
  },

  ion_drives: {
    id:          'ion_drives',
    namePL:      'Napędy Jonowe',
    branch:      'space',
    tier:        3,
    cost:        { research: 250 },
    requires:    ['rocketry'],
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 1.5 },
      { type: 'unlockShip', shipId: 'fast_scout' },
      { type: 'unlockShip', shipId: 'bulk_freighter' },
    ],
    description: 'Statki Gen II: Fast Scout + Bulk Freighter — ×1.5 prędkość, trail niebieski',
  },

  plasma_drives: {
    id:          'plasma_drives',
    namePL:      'Napędy Plazmowe',
    branch:      'space',
    tier:        3,
    cost:        { research: 300 },
    requires:    ['rocketry', 'plasma_physics'],
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 1.3 },
      { type: 'fuelEfficiency', multiplier: 0.7 },
    ],
    description: 'Alternatywa do jonowych: ×1.3 prędkość ALE -30% zużycie paliwa (dalszy zasięg)',
  },

  fusion_drives: {
    id:          'fusion_drives',
    namePL:      'Napędy Fuzyjne',
    branch:      'space',  // zmieniono z energy na space — główna gałąź napędowa
    tier:        4,
    cost:        { research: 450 },
    requires:    [['ion_drives', 'plasma_drives'], 'fusion_power'],  // OR: ion LUB plasma
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 1.5 },
      { type: 'unlockShip', shipId: 'fusion_explorer' },
      { type: 'unlockCommodity', commodityId: 'fusion_cells' },
    ],
    description: 'Statki Gen III: Fusion Explorer (+50% odkrycia) — ×1.5 prędkość (stackuje)',
  },

  antimatter_propulsion: {
    id:          'antimatter_propulsion',
    namePL:      'Napęd Antymaterii',
    branch:      'space',
    tier:        4,
    cost:        { research: 700 },
    requires:    ['fusion_drives', 'antimatter_containment'],
    requiresDiscovery: 'anihilacja_kontrolowana',
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 2.0 },
      { type: 'unlockShip', shipId: 'antimatter_cruiser' },
    ],
    description: 'Statki Gen IV: Antimatter Cruiser — ×2.0 prędkość (łącznie ×4.5)',
  },

  warp_theory: {
    id:          'warp_theory',
    namePL:      'Teoria Osnowy',
    nameEN:      'Warp Theory',
    branch:      'space',
    tier:        5,
    cost:        { research: 900 },
    requires:    ['antimatter_propulsion', 'quantum_physics'],
    requiresDiscovery: 'zakrzywienie_czasoprzestrzeni',
    effects: [
      { type: 'unlockBuilding', buildingId: 'warp_beacon' },
    ],
    description: 'Teoretyczne podstawy osnowy — prereq do Warp Drive + Warp Beacon',
  },

  warp_drive: {
    id:          'warp_drive',
    namePL:      'Napęd Skokowy',
    nameEN:      'Warp Drive',
    branch:      'space',
    tier:        5,
    cost:        { research: 1500 },
    requires:    ['warp_theory'],
    effects: [
      { type: 'unlockShip', shipId: 'starship' },
      { type: 'unlockCommodity', commodityId: 'warp_cores' },
      { type: 'unlockFeature', feature: 'interstellar_travel' },
    ],
    description: 'Statki Gen V: Starship + podróże międzygwiezdne (2.5 LY/rok)',
  },

  interstellar_colonization: {
    id:          'interstellar_colonization',
    namePL:      'Kolonizacja Gwiezdna',
    nameEN:      'Interstellar Colonization',
    branch:      'space',
    tier:        5,
    cost:        { research: 2000 },
    requires:    ['warp_drive', 'megastructures'],
    effects: [
      { type: 'unlockShip', shipId: 'ark_ship' },
      { type: 'unlockFeature', feature: 'victory_exodus' },
      { type: 'unlockBuilding', buildingId: 'jump_gate' },
    ],
    description: 'Arka + Jump Gate — kolonizacja i natychmiastowe skoki międzygwiezdne',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: INFORMATYKA (computing) 💻 — 6 tech ─────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  basic_computing: {
    id:          'basic_computing',
    namePL:      'Obliczenia Cyfrowe',
    branch:      'computing',
    tier:        1,
    cost:        { research: 70 },
    requires:    [],
    effects: [
      { type: 'unlockBuilding', buildingId: 'data_center' },
      { type: 'researchSlots', amount: 1 },
    ],
    description: 'Centrum Danych (+3 research) + drugi slot badawczy (2 tech jednocześnie)',
  },

  data_networks: {
    id:          'data_networks',
    namePL:      'Sieci Danych',
    branch:      'computing',
    tier:        2,
    cost:        { research: 150 },
    requires:    ['basic_computing'],
    effects: [
      { type: 'unlockFeature', feature: 'shared_discoveries' },
    ],
    description: 'Kolonie dzielą odkrycia — discovery widoczne na wszystkich koloniach',
  },

  artificial_intelligence: {
    id:          'artificial_intelligence',
    namePL:      'Sztuczna Inteligencja',
    branch:      'computing',
    tier:        3,
    cost:        { research: 400 },
    requires:    ['data_networks'],
    effects: [
      { type: 'autonomousEfficiency', multiplier: 1.5 },
      { type: 'unlockBuilding', buildingId: 'ai_core' },
    ],
    description: 'Budynki autonomiczne +50% wydajności. AI Core: -30% czas budowy (1/kolonia)',
  },

  quantum_computing: {
    id:          'quantum_computing',
    namePL:      'Obliczenia Kwantowe',
    branch:      'computing',
    tier:        3,
    cost:        { research: 450 },
    requires:    ['data_networks', 'quantum_physics'],
    requiresDiscovery: 'anomalia_kwantowa',
    effects: [
      { type: 'researchCostMultiplier', multiplier: 0.7 },
      { type: 'unlockCommodity', commodityId: 'quantum_processors' },
    ],
    description: 'Badania -30% research cost. Procesory kwantowe — prereq do nanofabrykacji',
  },

  predictive_modeling: {
    id:          'predictive_modeling',
    namePL:      'Modelowanie Predykcyjne',
    branch:      'computing',
    tier:        4,
    cost:        { research: 500 },
    requires:    ['artificial_intelligence'],
    effects: [
      { type: 'disasterReduction', amount: 100 },
      { type: 'unlockFeature', feature: 'exact_yield_preview' },
    ],
    description: 'Katastrofa misji 0% (AI trajektorie). Dokładny yield przed wysłaniem',
  },

  technological_singularity: {
    id:          'technological_singularity',
    namePL:      'Osobliwość Technologiczna',
    branch:      'computing',
    tier:        5,
    cost:        { research: 2000 },
    requires:    ['quantum_computing', 'artificial_intelligence'],
    effects: [
      { type: 'allBuildingsAutonomous' },
      { type: 'unlockFeature', feature: 'victory_singularity' },
    ],
    description: 'Wszystkie budynki autonomiczne (bez POPów). Warunek zwycięstwa: Singularność',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: OBRONNOŚĆ (defense) 🛡 — 5 tech ─────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  basic_shielding: {
    id:          'basic_shielding',
    namePL:      'Osłony Radiacyjne',
    branch:      'defense',
    tier:        1,
    cost:        { research: 60 },
    requires:    [],
    effects: [
      { type: 'terrainUnlock', terrain: 'ice_sheet', categories: ['population', 'research'] },
      { type: 'terrainUnlock', terrain: 'crater', categories: ['population', 'research'] },
      { type: 'prosperityBonus', amount: 2 },
    ],
    description: 'Budowa na lodowcu i kraterze (osłony radiacyjne) — dobrobyt +2',
  },

  point_defense: {
    id:          'point_defense',
    namePL:      'Obrona Punktowa',
    branch:      'defense',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['basic_shielding'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'defense_tower' },
      { type: 'disasterReduction', amount: 1.0 },
    ],
    description: 'Wieża Obronna — chroni planetę przed kometami, statki -1% katastrofa',
  },

  magnetic_shielding: {
    id:          'magnetic_shielding',
    namePL:      'Osłony Magnetyczne',
    branch:      'defense',
    tier:        3,
    cost:        { research: 350 },
    requires:    ['point_defense', 'plasma_physics'],
    effects: [
      { type: 'unlockFeature', feature: 'hot_body_exploration' },
    ],
    description: 'Statki mogą eksplorować gorące ciała (<0.3 AU od gwiazdy)',
  },

  planetary_defense: {
    id:          'planetary_defense',
    namePL:      'Obrona Planetarna',
    branch:      'defense',
    tier:        4,
    cost:        { research: 600 },
    requires:    ['magnetic_shielding'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'defense_grid' },
      { type: 'prosperityBonus', amount: 8 },
    ],
    description: 'Siatka Obronna — dobrobyt +8, kolonia chroniona przed katastrofami',
  },

  force_fields: {
    id:          'force_fields',
    namePL:      'Pola Siłowe',
    branch:      'defense',
    tier:        5,
    cost:        { research: 1000 },
    requires:    ['planetary_defense', 'antimatter_containment'],
    requiresDiscovery: 'manipulacja_pol',
    effects: [
      { type: 'shipSurvival', amount: 1.0 },
      { type: 'terrainUnlock', terrain: 'ocean', categories: ['mining', 'energy', 'food', 'population', 'research', 'space', 'military'] },
    ],
    description: 'Tarcze statków + budowa na oceanie (platformy siłowe)',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── CROSS-BRANCH: Fizyka Kwantowa ───────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  quantum_physics: {
    id:          'quantum_physics',
    namePL:      'Fizyka Kwantowa',
    branch:      'energy',
    tier:        3,
    cost:        { research: 500 },
    requires:    ['nuclear_power', 'data_networks'],
    effects: [
      { type: 'unlockCommodity', commodityId: 'quantum_processors' },
    ],
    description: 'Gateway do endgame — prereq: quantum_computing, antimatter_containment, warp_theory',
  },
};
