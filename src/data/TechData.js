// TechData — definicje drzewa technologii
//
// 5 gałęzi (branches):
//   mining    — wydobycie i metalurgia
//   energy    — energetyka
//   biology   — biologia i rolnictwo
//   civil     — administracja i budownictwo
//   space     — ekspansja kosmiczna
//
// Każda technologia ma:
//   id:         unikalny string-klucz
//   namePL:     polska nazwa
//   branch:     gałąź (jeden z 5 kluczy powyżej)
//   tier:       1–3 (wyższy tier = droższy i mocniejszy)
//   cost:       { research: X } — koszt w punktach badań
//   requires:   [] — tablica id technologii wymaganych (prerequisites)
//   effects:    [] — lista efektów (patrz niżej)
//   description: krótki opis PL
//
// Efekty (effects):
//   { type: 'modifier', resource, multiplier }
//     → mnoży bazową produkcję danego surowca ze wszystkich budynków kategorii
//       pasującej do resource
//   { type: 'unlockBuilding', buildingId }
//     → odblokowuje budynek który wcześniej ma requires: 'techId'
//   { type: 'moraleBonus', amount }
//     → stały bonus do morale cywilizacji (per rok, doliczany do CivilizationSystem)
//   { type: 'popGrowthBonus', multiplier }
//     → mnoży bazowy wskaźnik wzrostu populacji
//   { type: 'consumptionMultiplier', resource, multiplier }
//     → mnoży konsumpcję surowca przez populację (0.8 = 20% mniej zużycia)
//   { type: 'shipSpeedMultiplier', multiplier }
//     → mnoży prędkość WSZYSTKICH statków (stackuje się multiplikatywnie)
//   { type: 'disasterReduction', amount }
//     → zmniejsza szansę katastrofy misji o amount punktów procentowych (addytywnie)

export const TECH_BRANCHES = {
  mining:  { namePL: 'Wydobycie',  icon: '⛏', color: '#c8a870' },
  energy:  { namePL: 'Energia',    icon: '⚡', color: '#88ddff' },
  biology: { namePL: 'Biologia',   icon: '🌿', color: '#88dd88' },
  civil:   { namePL: 'Budownictwo',icon: '🏗', color: '#ddaacc' },
  space:   { namePL: 'Kosmos',     icon: '🚀', color: '#aaaaff' },
};

export const TECHS = {

  // ── Gałąź: Wydobycie ──────────────────────────────────────────────────────

  metallurgy: {
    id:          'metallurgy',
    namePL:      'Metalurgia',
    branch:      'mining',
    tier:        1,
    cost:        { research: 50 },  // gateway tech — tańszy
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
    cost:        { research: 90 },  // droższy — mining silny sam z siebie
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'minerals', multiplier: 1.2 },
    ],
    description: 'Ulepszone wiertła i materiały wybuchowe — +20% produkcji minerałów',
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
    description: 'Wydobycie z głębin + odblokowanie Huty — +30% minerałów, max level 7',
  },

  advanced_materials: {
    id:          'advanced_materials',
    namePL:      'Zaawansowane Materiały',
    branch:      'mining',
    tier:        2,
    cost:        { research: 150 },
    requires:    ['metallurgy'],
    effects: [],
    description: 'Zaawansowane technologie materiałowe — prerequisite do egzotycznych materiałów',
  },

  // ── Gałąź: Energia ────────────────────────────────────────────────────────

  efficient_solar: {
    id:          'efficient_solar',
    namePL:      'Wydajne Panele Słoneczne',
    branch:      'energy',
    tier:        1,
    cost:        { research: 70 },  // średni — energia ważna ale nie bottleneck
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'energy', multiplier: 1.2 },
    ],
    description: 'Nowa generacja ogniw fotowoltaicznych — +20% produkcji energii',
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
    ],
    description: 'Rozszczepienie atomu — +40% energii, odblokowanie Elektrowni Jądrowej',
  },

  // ── Gałąź: Biologia ───────────────────────────────────────────────────────

  hydroponics: {
    id:          'hydroponics',
    namePL:      'Hydroponika',
    branch:      'biology',
    tier:        1,
    cost:        { research: 60 },  // tańszy — krytyczny dla przetrwania
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'food', multiplier: 1.25 },
      { type: 'consumptionMultiplier', resource: 'water', multiplier: 0.8 },
    ],
    description: 'Uprawy bez gleby — +25% produkcji żywności, −20% zużycia wody',
  },

  genetic_engineering: {
    id:          'genetic_engineering',
    namePL:      'Inżynieria Genetyczna',
    branch:      'biology',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['hydroponics'],
    effects: [
      { type: 'modifier', resource: 'food', multiplier: 1.5 },
      { type: 'popGrowthBonus', multiplier: 1.2 },
    ],
    description: 'GMO i optymalizacja upraw — +50% produkcji żywności, +20% wzrost populacji',
  },

  // ── Gałąź: Budownictwo ────────────────────────────────────────────────────

  urban_planning: {
    id:          'urban_planning',
    namePL:      'Planowanie Urbanistyczne',
    branch:      'civil',
    tier:        1,
    cost:        { research: 80 },
    requires:    [],
    effects: [
      { type: 'moraleBonus', amount: 3 },
    ],
    description: 'Efektywna organizacja przestrzeni miejskiej — +3 morale/rok',
  },

  arcology: {
    id:          'arcology',
    namePL:      'Arkologie',
    branch:      'civil',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['urban_planning'],
    effects: [
      { type: 'moraleBonus', amount: 5 },
      { type: 'consumptionMultiplier', resource: 'food', multiplier: 0.90 },
    ],
    description: 'Samowystarczalne megastruktury — +5 morale/rok, −10% zużycia żywności',
  },

  // ── Gałąź: Kosmos ─────────────────────────────────────────────────────────

  orbital_survey: {
    id:          'orbital_survey',
    namePL:      'Kartografia Orbitalna',
    branch:      'space',
    tier:        1,
    cost:        { research: 110 },  // droższy — gateway do space branch
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'research', multiplier: 1.4 },
    ],
    description: 'Satelity i teleskopy — +40% produkcji badań naukowych',
  },

  space_mining: {
    id:          'space_mining',
    namePL:      'Górnictwo Kosmiczne',
    branch:      'space',
    tier:        2,
    cost:        { research: 250 },
    requires:    ['orbital_survey', 'advanced_mining'],
    effects: [
      { type: 'modifier', resource: 'minerals', multiplier: 1.6 },
      { type: 'buildingLevelCap', maxLevel: 10 },
    ],
    description: 'Wydobycie z asteroid — +60% produkcji minerałów, max level 10',
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
    description: 'Rakiety i napęd jonowy — odblokowanie Wyrzutni Rakietowej',
  },

  // ── Tier 3: Materiały egzotyczne i fizyka kwantowa ────────────────────────

  exotic_materials: {
    id:          'exotic_materials',
    namePL:      'Materiały Egzotyczne',
    branch:      'space',
    tier:        3,
    cost:        { research: 350 },
    requires:    ['advanced_materials', 'space_mining'],
    effects: [],
    description: 'Przetwarzanie ksenonu i egzotycznych metali — prerequisite do fizyki kwantowej',
  },

  quantum_physics: {
    id:          'quantum_physics',
    namePL:      'Fizyka Kwantowa',
    branch:      'energy',
    tier:        3,
    cost:        { research: 500 },
    requires:    ['nuclear_power', 'exotic_materials'],
    effects: [],
    description: 'Manipulacja materią na poziomie kwantowym — zaawansowana fizyka endgame',
  },

  // ── Tier 3: Eksploracja i kolonizacja ────────────────────────────────────

  exploration: {
    id:          'exploration',
    namePL:      'Eksploracja',
    branch:      'space',
    tier:        3,
    cost:        { research: 200 },
    requires:    ['rocketry'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'shipyard' },
      { type: 'unlockShip', shipId: 'science_vessel' },
    ],
    description: 'Budowa Stoczni i statków naukowych — wysyłanie zwiadów na inne ciała',
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
    description: 'Budowa statków kolonijnych — zakładanie osad na zbadanych ciałach',
  },

  interplanetary_logistics: {
    id:          'interplanetary_logistics',
    namePL:      'Logistyka Międzyplanetarna',
    branch:      'civil',
    tier:        3,
    cost:        { research: 250 },
    requires:    ['colonization'],
    effects: [
      { type: 'unlockFeature', feature: 'trade_routes' },
    ],
    description: 'Automatyczne drogi handlowe między koloniami — cykliczny transfer nadwyżek',
  },

  // ── Tier 3+4: Brakujące tech (odblokują istniejące budynki) ─────────────

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
    description: 'Sztuczna żywność — odblokowanie Zakładu Syntetycznej Żywności, +20% food',
  },

  fusion_power: {
    id:          'fusion_power',
    namePL:      'Energia Fuzji',
    branch:      'energy',
    tier:        3,
    cost:        { research: 400 },
    requires:    ['nuclear_power'],
    effects: [
      { type: 'unlockBuilding', buildingId: 'fusion_reactor' },
      { type: 'modifier', resource: 'energy', multiplier: 1.5 },
    ],
    description: 'Termojądrowa fuzja — odblokowanie Reaktora Fuzyjnego, +50% energii',
  },

  // ── Bezpieczeństwo misji ─────────────────────────────────────────────────

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
    description: 'Precyzyjne systemy nawigacyjne — −0.5% ryzyko katastrofy misji',
  },

  emergency_protocols: {
    id:          'emergency_protocols',
    namePL:      'Protokoły Awaryjne',
    branch:      'civil',
    tier:        3,
    cost:        { research: 280 },
    requires:    ['advanced_navigation', 'arcology'],
    effects: [
      { type: 'disasterReduction', amount: 0.5 },
    ],
    description: 'Systemy ratunkowe i procedury awaryjne — dodatkowe −0.5% ryzyko katastrofy',
  },

  // ── Gałąź napędowa (space + energy) ─────────────────────────────────────

  ion_drives: {
    id:          'ion_drives',
    namePL:      'Napędy Jonowe',
    branch:      'space',
    tier:        3,
    cost:        { research: 250 },
    requires:    ['rocketry'],
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 1.5 },
    ],
    description: 'Wydajne silniki jonowe — ×1.5 prędkości wszystkich statków',
  },

  fusion_drives: {
    id:          'fusion_drives',
    namePL:      'Napędy Fuzyjne',
    branch:      'energy',
    tier:        3,
    cost:        { research: 450 },
    requires:    ['ion_drives', 'fusion_power'],
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 1.5 },
    ],
    description: 'Silniki na mikrofuzji — ×1.5 prędkości (łącznie ×2.25 z napędami jonowymi)',
  },

  antimatter_propulsion: {
    id:          'antimatter_propulsion',
    namePL:      'Napęd Antymaterii',
    branch:      'space',
    tier:        4,
    cost:        { research: 700 },
    requires:    ['fusion_drives', 'quantum_physics'],
    effects: [
      { type: 'shipSpeedMultiplier', multiplier: 2.0 },
    ],
    description: 'Anihilacja materia-antymateria — ×2 prędkości (łącznie ×4.5)',
  },

  // ── Tier 4: Terraformacja ──────────────────────────────────────────────

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
    description: 'Przekształcanie atmosfer planet — odblokowanie Terraformera (mega-projekt)',
  },
};
