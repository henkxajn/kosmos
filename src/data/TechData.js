// TechData — definicje drzewa technologii (Etap 38 — Wielka Reforma)
//
// 8 gałęzi (branches):
//   mining    — wydobycie i metalurgia
//   energy    — energetyka
//   biology   — biologia i rolnictwo
//   civil     — administracja i budownictwo
//   space     — ekspansja kosmiczna
//   computing — informatyka i AI
//   defense   — obronność i osłony
//   synthetic — robotyka, androidy, AI
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
//   { type: 'unlockShipModule', moduleId }
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
//   { type: 'unlockArchetype', archetypeId }                          — Opcja C v3: ground unit archetype
//   { type: 'statBonus', stat: 'militaryOrg'|'militaryMorale'|'militarySupplyCap', amount } — Opcja C v3
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
  synthetic: { namePL: 'Synthetyka',   icon: '🤖', color: '#bb88ff' },
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
    ],
    description: 'Zaawansowane stopy (Hv+Fe+Cu) — potrzebne do statków Gen II',
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
    description: 'Ekspedycje mining zwracają rzadkie metale (Metale Ciężkie, Li)',
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
      { type: 'unlockCommodity', commodityId: 'metamaterials' },
    ],
    description: 'Metamateriały (Hv+Xe) — prereq do budynków T4+ i statków Gen III+',
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
    ],
    description: 'Fabryki produkują ×2 szybciej — nanotechnologia w produkcji',
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
    ],
    description: 'Ulepszona technologia magazynowania energii — statki lecą dalej na jednym tankowaniu',
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
    requiresInventory: { plasma_cores: 5 },
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
      { type: 'popGrowthBonus', multiplier: 1.3 },
    ],
    description: 'Laboratorium Genetyczne + wzrost POPów ×1.3',
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
      { type: 'unlockShipModule', moduleId: 'cryo_pod' },
    ],
    description: 'Hibernacja załóg — moduł kriogeniczny (więcej POPów na pokładzie)',
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
      { type: 'unlockShipModule', moduleId: 'cargo_mass' },
    ],
    description: 'Trasy handlowe + moduł ładunkowy masowy (duże ładownie)',
  },

  advanced_trade: {
    id:          'advanced_trade',
    namePL:      'Zaawansowany Handel',
    branch:      'civil',
    tier:        4,
    cost:        { research: 350 },
    requires:    ['interplanetary_logistics'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'trade_beacon' },
      { type: 'unlockBuilding', buildingId: 'commodity_nexus' },
    ],
    description: 'Radiolatarnia Handlowa + Nexus Towarowy — rozszerzony zasięg i globalne dopasowanie',
  },

  colonial_governance: {
    id:          'colonial_governance',
    namePL:      'Administracja Kolonialna',
    branch:      'civil',
    tier:        2,
    cost:        { research: 100 },
    requires:    ['urban_planning'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'cultural_center' },
    ],
    description: 'Struktury administracyjne — Centrum Kulturalne buduje tożsamość kolonii',
  },

  cultural_heritage: {
    id:          'cultural_heritage',
    namePL:      'Dziedzictwo Kulturowe',
    branch:      'civil',
    tier:        3,
    cost:        { research: 200 },
    requires:    ['colonial_governance'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'historical_archive' },
    ],
    description: 'Archiwum Historyczne — szybsze odkrywanie milestones, bonus badań',
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
    description: 'Katalog ciał + Obserwatorium (auto-skan ciał, bonus misji, ostrzeżenia)',
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
    ],
    description: 'Stocznia — budowa statków, misje kosmiczne',
  },

  colonization: {
    id:          'colonization',
    namePL:      'Kolonizacja',
    branch:      'space',
    tier:        3,
    cost:        { research: 300 },
    requires:    ['exploration'],
    effects: [
      { type: 'unlockShipModule', moduleId: 'habitat_pod' },
    ],
    description: 'Moduł habitatu — zakładanie osad na zbadanych ciałach',
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
      { type: 'unlockShipModule', moduleId: 'engine_ion' },
    ],
    description: 'Napęd jonowy — ×1.5 prędkość, moduł silnika Gen II',
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
      { type: 'unlockShipModule', moduleId: 'engine_fusion' },
    ],
    description: 'Napęd fuzyjny — ×1.5 prędkość (stackuje), moduł silnika Gen III',
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
    ],
    description: 'Napęd antymaterii — ×2.0 prędkość (łącznie ×4.5)',
  },

  // ── Kronika Lokalizacji — narracyjny gateway do narodzin frakcji (Faza C5) ──
  // Bada gdzie w galaktyce znalazła się kolonia. Po zbadaniu: wyzwala łańcuch
  // eventów narracyjnych (earth_located → first_voices_of_division → two_sides_emerge)
  // i odblokowuje FactionSystem (frakcje przestają być ukryte).
  kronika_lokalizacji: {
    id:          'kronika_lokalizacji',
    namePL:      'Kronika Lokalizacji',
    nameEN:      'Localization Chronicle',
    branch:      'space',
    tier:        3,
    cost:        { research: 500 },
    requires:    ['advanced_navigation', 'orbital_survey'],
    effects: [
      { type: 'modifier', resource: 'research', multiplier: 1.10 },
    ],
    description: 'Triangulacja sygnatur kosmicznych — odkrycie położenia Ziemi w galaktyce. Otwiera narracyjny rozdział narodzin frakcji.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Faza D2a: Ścieżka Kartograficzna (FTL) ───────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // kronika_lokalizacji → spacetime_cartography → quantum_fold_theory
  //                                                      ↓
  //                                              jump_gate_construction (capstone)

  spacetime_cartography: {
    id:          'spacetime_cartography',
    namePL:      'Kartografia Czasoprzestrzenna',
    nameEN:      'Spacetime Cartography',
    branch:      'space',
    tier:        4,
    cost:        { research: 800 },
    requires:    ['kronika_lokalizacji', 'quantum_physics'],
    effects: [
      { type: 'unlockBuilding',     buildingId: 'anomaly_research_lab' },
      // Placeholder hook — będzie skonsumowany przez AnomalyEffectSystem (Faza D3)
      { type: 'anomalyChanceBonus', value: 0.5 },
    ],
    description: 'Anomalia skoku nie była przypadkowa. Uczymy się czytać zakrzywienie przestrzeni — +50% szansa odkrycia anomalii temporalnych.',
  },

  quantum_fold_theory: {
    id:          'quantum_fold_theory',
    namePL:      'Teoria Składania Kwantowego',
    nameEN:      'Quantum Fold Theory',
    branch:      'space',
    tier:        4,
    cost:        { research: 1200 },
    requires:    ['spacetime_cartography', 'antimatter_containment'],
    effects: [
      { type: 'unlockBuilding',       buildingId: 'deep_space_array' },
      { type: 'shipSpeedMultiplier',  multiplier: 1.2 },
    ],
    description: 'Rozumiemy jak przestrzeń się złożyła. Teraz pytanie: czy możemy to powtórzyć? Statki +20% prędkość.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Faza D2a: Ścieżka Sfery Dysona ────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // space_mining → asteroid_mining
  //                       ↓
  //         megastructures + asteroid_mining + fusion_power → dyson_engineering
  //                                                                  ↓
  //                                                          dyson_collector
  //                                                                  ↓ ↓
  //                                                  dyson_transmitter   (path ends)
  //                                                  + jump_gate_construction (capstone z FTL)

  asteroid_mining: {
    id:          'asteroid_mining',
    namePL:      'Górnictwo Asteroidalne',
    nameEN:      'Asteroid Mining',
    branch:      'mining',
    tier:        3,
    cost:        { research: 300 },
    requires:    ['space_mining'],
    effects: [
      // Placeholder hook — będzie skonsumowany przez DepositSystem (Faza D3)
      // Bonus ×2.0 do złóż asteroid/planetoid
      { type: 'asteroidDepositMult', value: 2.0 },
    ],
    description: 'Pas asteroid to nieograniczone zasoby. Wystarczy po nie sięgnąć — ×2 wydobycie z planetoidów.',
  },

  dyson_engineering: {
    id:          'dyson_engineering',
    namePL:      'Inżynieria Sfery Dysona',
    nameEN:      'Dyson Sphere Engineering',
    branch:      'civil',
    tier:        4,
    cost:        { research: 800 },
    requires:    ['megastructures', 'asteroid_mining', 'fusion_power'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'dyson_command' },
      { type: 'unlockBuilding', buildingId: 'orbital_fabricator' },
      // EventBus emit `dyson:engineeringUnlocked` w TechSystem (DysonSystem hook — Faza D3)
    ],
    description: 'Sfera Dysona to nie marzenie — to projekt inżynierski. Mamy plany. Odblokowuje panel Sfery Dysona.',
  },

  dyson_collector: {
    id:          'dyson_collector',
    namePL:      'Systemy Zbierające Dysona',
    nameEN:      'Dyson Collection Systems',
    branch:      'civil',
    tier:        5,
    cost:        { research: 1500 },
    requires:    ['dyson_engineering', 'quantum_computing'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'stellar_collector_relay' },
      { type: 'modifier', resource: 'energy', multiplier: 3.0 },
      // EventBus emit `dyson:collectorUnlocked` w TechSystem (Fazy II-III Sfery)
    ],
    description: 'Panele zbierają energię gwiazdy. Po raz pierwszy więcej energii niż potrzebujemy — ×3 produkcja energii.',
  },

  dyson_transmitter: {
    id:          'dyson_transmitter',
    namePL:      'Transmisja Mocy Dysona',
    nameEN:      'Dyson Power Transmission',
    branch:      'energy',
    tier:        5,
    cost:        { research: 1200 },
    requires:    ['dyson_collector', 'zero_point_energy'],
    effects: [
      // Placeholder hook — będzie skonsumowany przez VesselManager (Faza D3)
      { type: 'shipRangeMult', value: 2.0 },
      // EventBus emit `dyson:transmitterUnlocked` w TechSystem (Faza IV Sfery)
    ],
    description: 'Energia Sfery zasila całą flotę. Typ I osiągnięty — statki +100% zasięg.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Faza D2a: Brama Skoku (capstone) ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  // Wymaga obu ścieżek (Dyson + FTL). Osobny tech od interstellar_colonization
  // (które dalej istnieje jako "tania" droga do pojedynczego jump_gate buildingu).
  jump_gate_construction: {
    id:          'jump_gate_construction',
    namePL:      'Budowa Bramy Skoku',
    nameEN:      'Jump Gate Construction',
    branch:      'space',
    tier:        5,
    cost:        { research: 2000 },
    requires:    ['dyson_collector', 'quantum_fold_theory', 'warp_drive'],
    effects: [
      // Odblokowanie ekranu Decyzji Końcowej (Faza D4)
      { type: 'unlockFeature', feature: 'endgame_decision' },
      // EventBus emit `dyson:jumpGateUnlocked` w TechSystem (segment 20 Sfery)
    ],
    description: 'Mamy energię. Mamy teorię. Mamy materiały. Pytanie pozostaje — dokąd?',
  },

  warp_theory: {
    id:          'warp_theory',
    namePL:      'Teoria Osnowy',
    nameEN:      'Warp Theory',
    branch:      'space',
    tier:        3,
    cost:        { research: 900 },
    requires:    ['ion_drives', 'quantum_physics'],
    requiresDiscovery: 'zakrzywienie_czasoprzestrzeni',
    requiresInventory: { metamaterials: 8, quantum_processors: 1 },
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
    tier:        4,
    cost:        { research: 1500 },
    requires:    ['warp_theory'],
    effects: [
      { type: 'unlockShipModule', moduleId: 'engine_warp' },
      { type: 'unlockCommodity', commodityId: 'warp_cores' },
      { type: 'unlockFeature', feature: 'interstellar_travel' },
    ],
    description: 'Moduł napędu skokowego + podróże międzygwiezdne (2.5 LY/rok)',
  },

  warp_drive_mk2: {
    id:          'warp_drive_mk2',
    namePL:      'Zaawansowany Napęd Skokowy',
    nameEN:      'Advanced Warp Drive',
    branch:      'space',
    tier:        5,
    cost:        { research: 2200 },     // ⚙ knob
    requires:    ['warp_drive'],
    effects: [
      { type: 'unlockShipModule', moduleId: 'engine_warp_mk2' },
    ],
    description: 'Stabilizacja pola warp — silnik VDT-W2 z +50% mocy sublight (skok bez zmian).',
  },

  interstellar_colonization: {
    id:          'interstellar_colonization',
    namePL:      'Kolonizacja Gwiezdna',
    nameEN:      'Interstellar Colonization',
    branch:      'space',
    tier:        5,
    cost:        { research: 2000 },
    requires:    ['warp_drive'],
    requiresInventory: { warp_cores: 5 },
    effects: [
      { type: 'unlockFeature', feature: 'victory_exodus' },
      { type: 'unlockBuilding', buildingId: 'jump_gate' },
    ],
    description: 'Jump Gate — kolonizacja i natychmiastowe skoki międzygwiezdne',
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
      { type: 'unlockBuilding', buildingId: 'ai_nexus' },
    ],
    description: 'Budynki autonomiczne +50%. AI Core (-30% budowa). Centrum AI',
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
    description: 'Badania -30% research cost. Procesory kwantowe',
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
  // ── WOJNA LĄDOWA (defense) ⚔ — 9 tech (Opcja C v3) ──────────────────────
  // Dodatkowe efekty używane przez GroundUnitSystem:
  //   { type: 'unlockArchetype', archetypeId }   — odblokowanie archetypu jednostki
  //   { type: 'statBonus', stat: 'militaryOrg'|'militaryMorale'|'militarySupplyCap', amount }
  // ══════════════════════════════════════════════════════════════════════════

  ground_warfare: {
    id:          'ground_warfare',
    namePL:      'Wojna Lądowa',
    branch:      'defense',
    tier:        2,
    cost:        { research: 150 },
    requires:    ['rocketry'],
    effects: [
      { type: 'unlockBuilding',   buildingId:  'barracks_lv2' },
      { type: 'unlockArchetype',  archetypeId: 'rocket_artillery' },
      { type: 'unlockArchetype',  archetypeId: 'aa_platform' },
      { type: 'unlockArchetype',  archetypeId: 'medic_unit' },
    ],
    description: 'Doktryna walki pojazdów i wsparcia — Koszary Lv2 + artyleria, AA, medycy',
  },

  drone_warfare: {
    id:          'drone_warfare',
    namePL:      'Wojna Dronowa',
    branch:      'defense',
    tier:        3,
    cost:        { research: 280 },
    requires:    ['ground_warfare'],
    effects: [
      { type: 'unlockBuilding',   buildingId:  'barracks_lv3' },
      { type: 'unlockArchetype',  archetypeId: 'recon_drone' },
    ],
    description: 'Zdalnie sterowane i autonomiczne systemy bojowe — Koszary Lv3 + drony',
  },

  military_logistics: {
    id:          'military_logistics',
    namePL:      'Logistyka Wojskowa',
    branch:      'defense',
    tier:        2,
    cost:        { research: 150 },
    requires:    ['ground_warfare'],
    effects: [
      { type: 'unlockCommodity',  commodityId: 'military_supplies' },
      { type: 'unlockArchetype',  archetypeId: 'ground_supply_unit' },
      { type: 'statBonus',        stat: 'militaryOrg',       amount: 10 },
      { type: 'statBonus',        stat: 'militaryMorale',    amount: 10 },
      { type: 'statBonus',        stat: 'militarySupplyCap', amount: 20 },
    ],
    description: 'Zaopatrzenie Wojskowe (commodity) + Jednostka Zaopatrzeniowa, +10 org, +10 mor, cap supply +20',
  },

  field_discipline: {
    id:          'field_discipline',
    namePL:      'Dyscyplina Polowa',
    branch:      'defense',
    tier:        2,
    cost:        { research: 160 },
    requires:    ['ground_warfare'],
    effects: [
      { type: 'statBonus', stat: 'militaryOrg',    amount: 15 },
      { type: 'statBonus', stat: 'militaryMorale', amount: 15 },
    ],
    description: 'Regularne szkolenie i drill — +15 organizacja, +15 morale dla wszystkich jednostek',
  },

  combat_doctrine: {
    id:          'combat_doctrine',
    namePL:      'Doktryna Bojowa',
    branch:      'defense',
    tier:        3,
    cost:        { research: 220 },
    requires:    ['field_discipline'],
    effects: [
      { type: 'statBonus', stat: 'militaryOrg',    amount: 15 },
      { type: 'statBonus', stat: 'militaryMorale', amount: 10 },
    ],
    description: 'Taktyka kombinowana — +15 organizacja, +10 morale',
  },

  elite_training: {
    id:          'elite_training',
    namePL:      'Elitarne Szkolenie',
    branch:      'defense',
    tier:        3,
    cost:        { research: 220 },
    requires:    ['field_discipline'],
    effects: [
      { type: 'statBonus', stat: 'militaryOrg',    amount: 10 },
      { type: 'statBonus', stat: 'militaryMorale', amount: 15 },
    ],
    description: 'Programy elitarnego treningu — +10 organizacja, +15 morale',
  },

  fleet_logistics: {
    id:          'fleet_logistics',
    namePL:      'Logistyka Flotowa',
    branch:      'defense',
    tier:        3,
    cost:        { research: 260 },
    requires:    ['military_logistics', 'drone_warfare'],
    effects: [
      { type: 'unlockShip',       shipId: 'space_supply_ship' },
      { type: 'statBonus',        stat: 'militaryOrg',       amount: 5 },
      { type: 'statBonus',        stat: 'militaryMorale',    amount: 5 },
      { type: 'statBonus',        stat: 'militarySupplyCap', amount: 20 },
    ],
    description: 'Zaopatrzenie kosmiczne — Statek Zaopatrzeniowy, +5/+5 org/mor, cap supply +20 (placeholder fleet-group)',
  },

  tech_munitions: {
    id:          'tech_munitions',
    namePL:      'Amunicja Orbitalna',
    nameEN:      'Orbital Munitions',
    branch:      'defense',
    tier:        3,
    cost:        { research: 240 },
    requires:    ['ground_warfare'],
    effects: [
      { type: 'unlockCommodity',   commodityId: 'orbital_shells' },
      { type: 'unlockShipModule',  moduleId:    'orbital_strike_battery' },
    ],
    description: 'Pociski Orbitalne (commodity) + Bateria Ostrzału Orbitalnego (moduł statku) — wsparcie ogniowe z orbity dla sił naziemnych',
  },

  strategic_doctrine: {
    id:          'strategic_doctrine',
    namePL:      'Doktryna Strategiczna',
    branch:      'defense',
    tier:        4,
    cost:        { research: 320 },
    requires:    ['combat_doctrine'],
    effects: [
      { type: 'statBonus', stat: 'militaryOrg',    amount: 20 },
      { type: 'statBonus', stat: 'militaryMorale', amount: 15 },
    ],
    description: 'Sztab generalny i wywiad — +20 organizacja, +15 morale',
  },

  veteran_corps: {
    id:          'veteran_corps',
    namePL:      'Korpus Weteranów',
    branch:      'defense',
    tier:        4,
    cost:        { research: 320 },
    requires:    ['elite_training'],
    effects: [
      { type: 'statBonus', stat: 'militaryOrg',       amount: 15 },
      { type: 'statBonus', stat: 'militaryMorale',    amount: 20 },
      { type: 'statBonus', stat: 'militarySupplyCap', amount: 20 },
    ],
    description: 'Doświadczeni żołnierze — +15/+20 org/mor, cap supply +20',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ── M4 P3: Deep-Space Combat — Sensor + Weapon Range Tech (defense) ──────
  // ══════════════════════════════════════════════════════════════════════════
  // Pasywne mnożniki kategorii konsumowane przez TechSystem.getMultiplier(category):
  //   sensor_range, weapon_range_short, weapon_range_medium, weapon_range_long,
  //   weapon_range_all, weapon_tracking_medium, weapon_tracking_long
  // Effect schema: { type: 'multiplier', category: '<key>', value: <num> }
  // (Różne od 'modifier' używanego przez ResourceSystem dla yield producentów.)

  advanced_sensors_1: {
    id:          'advanced_sensors_1',
    namePL:      'Zaawansowane Sensory I',
    nameEN:      'Advanced Sensors I',
    branch:      'defense',
    tier:        1,
    cost:        { research: 80 },
    requires:    [],
    effects: [
      { type: 'multiplier', category: 'sensor_range', value: 1.25 },
    ],
    description: 'Lepsze anteny radarowe — +25% zasięg sensorów statków (0.5 → 0.625 AU).',
  },

  advanced_sensors_2: {
    id:          'advanced_sensors_2',
    namePL:      'Zaawansowane Sensory II',
    nameEN:      'Advanced Sensors II',
    branch:      'defense',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['advanced_sensors_1'],
    effects: [
      { type: 'multiplier', category: 'sensor_range', value: 1.20 },  // łącznie ×1.5 z poprzednim
    ],
    description: 'Macierze fazowane — łącznie ×1.5 zasięg sensorów (0.75 AU).',
  },

  advanced_sensors_3: {
    id:          'advanced_sensors_3',
    namePL:      'Zaawansowane Sensory III',
    nameEN:      'Advanced Sensors III',
    branch:      'defense',
    tier:        3,
    cost:        { research: 320 },
    requires:    ['advanced_sensors_2', 'quantum_computing'],
    effects: [
      { type: 'multiplier', category: 'sensor_range', value: 1.333 },  // łącznie ×2.0 (1.25 × 1.20 × 1.333)
    ],
    description: 'Sieci sensoryczne kwantowe — łącznie ×2.0 zasięg sensorów (1.0 AU).',
  },

  weapon_optics: {
    id:          'weapon_optics',
    namePL:      'Optyka Bojowa',
    nameEN:      'Combat Optics',
    branch:      'defense',
    tier:        2,
    cost:        { research: 160 },
    requires:    ['point_defense'],
    effects: [
      { type: 'multiplier', category: 'weapon_range_short', value: 1.25 },
    ],
    description: 'Celowniki laserowe i światłowodowe — +25% zasięg broni krótkiego zasięgu (lasery).',
  },

  kinetic_targeting: {
    id:          'kinetic_targeting',
    namePL:      'Naprowadzanie Kinetyczne',
    nameEN:      'Kinetic Targeting',
    branch:      'defense',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['point_defense'],
    effects: [
      { type: 'multiplier', category: 'weapon_range_medium',    value: 1.30 },
      { type: 'multiplier', category: 'weapon_tracking_medium', value: 1.10 },
    ],
    description: 'Komputery balistyczne — +30% zasięg + 10% tracking broni średniego zasięgu (działa kinetyczne).',
  },

  missile_guidance_ai: {
    id:          'missile_guidance_ai',
    namePL:      'AI Naprowadzania Rakiet',
    nameEN:      'Missile Guidance AI',
    branch:      'defense',
    tier:        3,
    cost:        { research: 320 },
    requires:    ['point_defense', 'quantum_computing'],
    effects: [
      { type: 'multiplier', category: 'weapon_range_long',    value: 1.50 },
      { type: 'multiplier', category: 'weapon_tracking_long', value: 1.10 },
    ],
    description: 'Algorytmy ścieżek dynamicznych — +50% zasięg + 10% tracking rakiet.',
  },

  range_finder_array: {
    id:          'range_finder_array',
    namePL:      'Macierz Dalmierzy',
    nameEN:      'Range Finder Array',
    branch:      'defense',
    tier:        3,
    cost:        { research: 280 },
    requires:    ['advanced_sensors_2'],
    effects: [
      { type: 'multiplier', category: 'weapon_range_all', value: 1.15 },
    ],
    description: 'Macierz LIDAR sprzężona z bronią — +15% zasięg wszystkich rodzajów broni.',
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── GAŁĄŹ: SYNTHETYKA (synthetic) 🤖 — 4 tech ─────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  robotics: {
    id:          'robotics',
    namePL:      'Robotyka',
    nameEN:      'Robotics',
    branch:      'synthetic',
    tier:        2,
    cost:        { research: 120 },
    requires:    ['metallurgy'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'robot_assembly' },
      { type: 'unlockCommodity', commodityId: 'android_worker' },
      { type: 'modifier', resource: 'minerals', multiplier: 1.10 },
    ],
    description: 'Automatyzacja procesów przemysłowych — androidy robocze',
  },

  android_engineering: {
    id:          'android_engineering',
    namePL:      'Inżynieria Androidów',
    nameEN:      'Android Engineering',
    branch:      'synthetic',
    tier:        3,
    cost:        { research: 300 },
    requires:    ['robotics', 'advanced_materials'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'android_lab' },
      { type: 'unlockCommodity', commodityId: 'android_worker' },
    ],
    description: 'Projektowanie humanoidalnych androidów roboczych',
  },

  // ai_nexus odblokowywane przez istniejący artificial_intelligence (computing branch)
};
