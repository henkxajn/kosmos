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

export const TECH_BRANCHES = {
  mining:  { namePL: 'Wydobycie',  icon: '⛏', color: '#c8a870' },
  energy:  { namePL: 'Energia',    icon: '⚡', color: '#88ddff' },
  biology: { namePL: 'Biologia',   icon: '🌿', color: '#88dd88' },
  civil:   { namePL: 'Budownictwo',icon: '🏗', color: '#ddaacc' },
  space:   { namePL: 'Kosmos',     icon: '🚀', color: '#aaaaff' },
};

export const TECHS = {

  // ── Gałąź: Wydobycie ──────────────────────────────────────────────────────

  advanced_mining: {
    id:          'advanced_mining',
    namePL:      'Zaawansowane Wydobycie',
    branch:      'mining',
    tier:        1,
    cost:        { research: 80 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'minerals', multiplier: 1.3 },
    ],
    description: 'Ulepszone wiertła i materiały wybuchowe — +30% produkcji minerałów',
  },

  deep_drilling: {
    id:          'deep_drilling',
    namePL:      'Głębokie Wiercenia',
    branch:      'mining',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['advanced_mining'],
    effects: [
      { type: 'modifier', resource: 'minerals', multiplier: 1.5 },
      { type: 'unlockBuilding', buildingId: 'smelter' },
    ],
    description: 'Wydobycie z głębin + odblokowanie Huty — +50% minerałów',
  },

  // ── Gałąź: Energia ────────────────────────────────────────────────────────

  efficient_solar: {
    id:          'efficient_solar',
    namePL:      'Wydajne Panele Słoneczne',
    branch:      'energy',
    tier:        1,
    cost:        { research: 80 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'energy', multiplier: 1.3 },
    ],
    description: 'Nowa generacja ogniw fotowoltaicznych — +30% produkcji energii',
  },

  nuclear_power: {
    id:          'nuclear_power',
    namePL:      'Energetyka Jądrowa',
    branch:      'energy',
    tier:        2,
    cost:        { research: 220 },
    requires:    ['efficient_solar'],
    effects: [
      { type: 'modifier', resource: 'energy', multiplier: 1.6 },
      { type: 'unlockBuilding', buildingId: 'nuclear_plant' },
    ],
    description: 'Rozszczepienie atomu — +60% energii, odblokowanie Elektrowni Jądrowej',
  },

  // ── Gałąź: Biologia ───────────────────────────────────────────────────────

  hydroponics: {
    id:          'hydroponics',
    namePL:      'Hydroponika',
    branch:      'biology',
    tier:        1,
    cost:        { research: 80 },
    requires:    [],
    effects: [
      { type: 'modifier', resource: 'organics', multiplier: 1.4 },
      { type: 'consumptionMultiplier', resource: 'water', multiplier: 0.8 },
    ],
    description: 'Uprawy bez gleby — +40% organiki, −20% zużycia wody',
  },

  genetic_engineering: {
    id:          'genetic_engineering',
    namePL:      'Inżynieria Genetyczna',
    branch:      'biology',
    tier:        2,
    cost:        { research: 200 },
    requires:    ['hydroponics'],
    effects: [
      { type: 'modifier', resource: 'organics', multiplier: 1.7 },
      { type: 'popGrowthBonus', multiplier: 1.3 },
    ],
    description: 'GMO i optymalizacja upraw — +70% organiki, +30% wzrost populacji',
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
      { type: 'moraleBonus', amount: 5 },
    ],
    description: 'Efektywna organizacja przestrzeni miejskiej — +5 morale/rok',
  },

  arcology: {
    id:          'arcology',
    namePL:      'Arkologie',
    branch:      'civil',
    tier:        2,
    cost:        { research: 180 },
    requires:    ['urban_planning'],
    effects: [
      { type: 'moraleBonus', amount: 8 },
      { type: 'consumptionMultiplier', resource: 'organics', multiplier: 0.85 },
    ],
    description: 'Samowystarczalne megastruktury — +8 morale/rok, −15% zużycia organiki',
  },

  // ── Gałąź: Kosmos ─────────────────────────────────────────────────────────

  orbital_survey: {
    id:          'orbital_survey',
    namePL:      'Kartografia Orbitalna',
    branch:      'space',
    tier:        1,
    cost:        { research: 100 },
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
      { type: 'modifier', resource: 'minerals', multiplier: 2.0 },
    ],
    description: 'Wydobycie z asteroid — podwojenie produkcji minerałów',
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
};
