// EmpireData — dane archetypów obcych imperiów
//
// Archetyp to osobowość AI: wektor cech (0-1) sterujący FSM w AlienCivSystem
// oraz scoring w MilitaryAI / EconAI. Każdy archetyp ma też paletę kolorów
// (ikona na GalaxyMap) i dwujęzyczne etykiety.
//
// Użycie:
//   import { ARCHETYPES, pickArchetype } from '../data/EmpireData.js';
//   const arch = ARCHETYPES.xenophage;
//   arch.personality.aggression  // 0.9

// Osie osobowości (wszystkie 0-1):
//   aggression — skłonność do wojny/eskalacji
//   expansion  — tempo kolonizacji i rozbudowy floty
//   secrecy    — ukrywanie technologii i kolonii (intel gracza postępuje wolniej)
//   trade      — otwartość na umowy handlowe i sojusze
//   science    — priorytet badań, tempo wzrostu techLevel

export const ARCHETYPES = {
  xenophage: {
    id: 'xenophage',
    namePL: 'Xenofag',
    nameEN: 'Xenophage',
    descPL: 'Ksenofobiczny drapieżnik. Agresywny, ekspansywny, nienawidzi innych form życia.',
    descEN: 'Xenophobic predator. Aggressive, expansionist, abhors other life-forms.',
    color: '#B03030',
    personality: { aggression: 0.9, expansion: 0.8, secrecy: 0.3, trade: 0.1, science: 0.4 },
  },
  isolationist: {
    id: 'isolationist',
    namePL: 'Izolacjonista',
    nameEN: 'Isolationist',
    descPL: 'Zamknięty w sobie. Rzadko atakuje, ale nie toleruje ingerencji.',
    descEN: 'Reclusive. Rarely attacks, but does not tolerate intrusion.',
    color: '#4A5A80',
    personality: { aggression: 0.2, expansion: 0.2, secrecy: 0.9, trade: 0.1, science: 0.6 },
  },
  trader: {
    id: 'trader',
    namePL: 'Handlarz',
    nameEN: 'Trader',
    descPL: 'Kupiec gwiezdny. Preferuje umowy, sieci szlaków, wymianę technologii.',
    descEN: 'Star merchant. Prefers treaties, trade networks, tech exchange.',
    color: '#C89040',
    personality: { aggression: 0.3, expansion: 0.5, secrecy: 0.3, trade: 0.9, science: 0.5 },
  },
  hegemon: {
    id: 'hegemon',
    namePL: 'Hegemon',
    nameEN: 'Hegemon',
    descPL: 'Imperium kalkulujące. Rozbudowuje flotę metodycznie, czeka na przewagę.',
    descEN: 'Calculating empire. Builds fleet methodically, waits for advantage.',
    color: '#7A50A0',
    personality: { aggression: 0.7, expansion: 0.9, secrecy: 0.4, trade: 0.5, science: 0.6 },
  },
  swarm: {
    id: 'swarm',
    namePL: 'Rój',
    nameEN: 'Swarm',
    descPL: 'Kolektyw biologiczny. Kolonizuje wszystko co możliwe, brak dyplomacji.',
    descEN: 'Biological collective. Colonizes everything possible, no diplomacy.',
    color: '#60A050',
    personality: { aggression: 0.8, expansion: 0.95, secrecy: 0.1, trade: 0.0, science: 0.3 },
  },
};

// Lista ID w stabilnej kolejności (do losowania deterministycznego)
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

// Pomocnicza: wybór archetypu przez PRNG (deterministyczny przy podanym rng)
// rng: funkcja () → [0,1) — np. z seedu układu
export function pickArchetype(rng = Math.random) {
  const idx = Math.floor(rng() * ARCHETYPE_IDS.length);
  return ARCHETYPES[ARCHETYPE_IDS[idx]];
}

// Bazowa nazwa cywilizacji — prefiks wg archetypu (finalną nazwę składa EmpireGenerator)
export const NAME_PREFIXES_PL = {
  xenophage:    ['Rój',     'Horda',     'Pożeracze',   'Krew',       'Głód'],
  isolationist: ['Strażnicy','Ukryci',   'Milczący',    'Zakon',      'Pustelnicy'],
  trader:       ['Konsorcjum','Liga',    'Szlak',       'Karawana',   'Kompania'],
  hegemon:      ['Imperium', 'Dominium', 'Suwerenat',   'Korona',     'Tron'],
  swarm:        ['Rój',      'Kolektyw', 'Ul',          'Potomstwo',  'Tkanka'],
};

export const NAME_PREFIXES_EN = {
  xenophage:    ['Swarm',        'Horde',       'Devourers',  'Blood',     'Hunger'],
  isolationist: ['Wardens',      'Hidden',      'Silent',     'Order',     'Hermits'],
  trader:       ['Consortium',   'League',      'Route',      'Caravan',   'Company'],
  hegemon:      ['Empire',       'Dominion',    'Sovereignty','Crown',     'Throne'],
  swarm:        ['Swarm',        'Collective',  'Hive',       'Brood',     'Tissue'],
};
