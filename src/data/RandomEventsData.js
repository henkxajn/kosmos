// RandomEventsData — definicje zdarzeń losowych
//
// Kategorie:
//   natural  — katastrofy naturalne
//   discovery — odkrycia i szanse
//   social   — zdarzenia społeczne
//   cosmic   — zdarzenia kosmiczne (powiązane z symulacją)
//
// Każde zdarzenie:
//   id:          unikalny klucz
//   namePL:      polska nazwa
//   nameEN:      angielska nazwa
//   category:    kategoria ('natural' | 'discovery' | 'social' | 'cosmic')
//   weight:      prawdopodobieństwo (wyższe = częstsze)
//   condition:   funkcja(colony, gameState) → bool — czy zdarzenie może zajść
//   duration:    czas trwania w latach (0 = jednorazowe)
//   defenseTag:  tag obrony (null | 'kinetic' | 'radiation' | 'biological')
//   effects:     tablica efektów:
//     { type: 'resource', resource, amount }           — jednorazowa zmiana
//     { type: 'production', resource, multiplier }     — mnożnik produkcji na czas trwania
//     { type: 'prosperity', delta }                    — zmiana prosperity
//     { type: 'pop', delta }                           — zmiana populacji
//     { type: 'building_damage', count }               — zniszczenie N losowych budynków
//   descriptionPL: opis po polsku (dla EventLog)
//   descriptionEN: opis po angielsku
//   icon:        ikona zdarzenia
//   severity:    'info' | 'warning' | 'danger' — styl powiadomienia
//
// Chain events:
//   chainId:     id łańcucha (opcjonalnie)
//   chainNext:   id następnego zdarzenia w łańcuchu
//   chainDelay:  opóźnienie w latach do następnego zdarzenia

export const RANDOM_EVENTS = {

  // ═══════════════════════════════════════════════════════════════════════
  //  A. KATASTROFY NATURALNE
  // ═══════════════════════════════════════════════════════════════════════

  meteor_shower: {
    id:          'meteor_shower',
    namePL:      'Deszcz meteorów',
    nameEN:      'Meteor Shower',
    category:    'natural',
    icon:        '☄',
    severity:    'danger',
    weight:      8,
    duration:    3,
    defenseTag:  'kinetic',
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'all', multiplier: 0.8 },
      { type: 'prosperity', delta: -8 },
      { type: 'building_damage', count: 1, chance: 0.3 },
    ],
    descriptionPL: 'Deszcz meteorów uderza w kolonię! Produkcja spada o 20% na 3 lata.',
    descriptionEN: 'A meteor shower strikes the colony! Production drops by 20% for 3 years.',
  },

  solar_flare: {
    id:          'solar_flare',
    namePL:      'Rozbłysk słoneczny',
    nameEN:      'Solar Flare',
    category:    'natural',
    icon:        '☀',
    severity:    'warning',
    weight:      6,
    duration:    3,
    defenseTag:  'radiation',
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'energy', multiplier: 0.7 },
      { type: 'prosperity', delta: -5 },
    ],
    descriptionPL: 'Potężny rozbłysk gwiazdy zakłóca systemy energetyczne. -30% energii na 3 lata.',
    descriptionEN: 'A powerful stellar flare disrupts energy systems. -30% energy for 3 years.',
  },

  earthquake: {
    id:          'earthquake',
    namePL:      'Trzęsienie gruntu',
    nameEN:      'Groundquake',
    category:    'natural',
    icon:        '🌋',
    severity:    'danger',
    weight:      5,
    duration:    0,
    defenseTag:  null,
    condition:   (col) => col?.planet?.planetType === 'rocky',
    effects: [
      { type: 'building_damage', count: 1, chance: 0.5 },
      { type: 'prosperity', delta: -10 },
    ],
    descriptionPL: 'Silne trzęsienie gruntu! Budynki mogą ulec zniszczeniu.',
    descriptionEN: 'A strong groundquake! Buildings may be destroyed.',
  },

  epidemic: {
    id:          'epidemic',
    namePL:      'Epidemia',
    nameEN:      'Epidemic',
    category:    'natural',
    icon:        '🦠',
    severity:    'danger',
    weight:      4,
    duration:    5,
    defenseTag:  'biological',
    condition:   (col) => (col?.civSystem?.population ?? 0) >= 5,
    effects: [
      { type: 'pop', delta: -1 },
      { type: 'prosperity', delta: -15 },
      { type: 'production', resource: 'organics', multiplier: 0.7 },
    ],
    descriptionPL: 'Epidemia! Populacja traci 1 POPa, dobrobyt spada, produkcja żywności -30% na 5 lat.',
    descriptionEN: 'Epidemic! Population loses 1 POP, prosperity drops, food production -30% for 5 years.',
  },

  volcanic_eruption: {
    id:          'volcanic_eruption',
    namePL:      'Erupcja wulkanu',
    nameEN:      'Volcanic Eruption',
    category:    'natural',
    icon:        '🌋',
    severity:    'danger',
    weight:      3,
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'prosperity', delta: -5 },
      { type: 'resource', resource: 'minerals', amount: 50 },
    ],
    descriptionPL: 'Erupcja wulkaniczna! Wyrzucono minerały na powierzchnię.',
    descriptionEN: 'Volcanic eruption! Minerals ejected to the surface.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  B. ODKRYCIA I SZANSE
  // ═══════════════════════════════════════════════════════════════════════

  mineral_deposit: {
    id:          'mineral_deposit',
    namePL:      'Odkrycie złóż',
    nameEN:      'Mineral Deposit Discovery',
    category:    'discovery',
    icon:        '💎',
    severity:    'info',
    weight:      10,
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'minerals', amount: 200 },
    ],
    descriptionPL: 'Odkryto bogate złoża minerałów! +200⛏',
    descriptionEN: 'Rich mineral deposits discovered! +200⛏',
  },

  scientific_anomaly: {
    id:          'scientific_anomaly',
    namePL:      'Anomalia naukowa',
    nameEN:      'Scientific Anomaly',
    category:    'discovery',
    icon:        '✦',
    severity:    'info',
    weight:      7,
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'research', amount: 100 },
    ],
    descriptionPL: 'Wykryto anomalię naukową! +100🔬',
    descriptionEN: 'Scientific anomaly detected! +100🔬',
    chainId:     'anomaly_chain',
    chainNext:   'anomaly_resolution',
    chainDelay:  5,
  },

  anomaly_resolution: {
    id:          'anomaly_resolution',
    namePL:      'Zbadano anomalię',
    nameEN:      'Anomaly Resolved',
    category:    'discovery',
    icon:        '🔍',
    severity:    'info',
    weight:      0,   // 0 = nie losowane, tylko jako chain
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'research', amount: 200 },
    ],
    descriptionPL: 'Anomalię zbadano! Odkryto starożytne struktury. +200🔬',
    descriptionEN: 'Anomaly resolved! Ancient structures discovered. +200🔬',
  },

  geothermal_source: {
    id:          'geothermal_source',
    namePL:      'Źródło geotermalne',
    nameEN:      'Geothermal Source',
    category:    'discovery',
    icon:        '♨',
    severity:    'info',
    weight:      5,
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'energy', amount: 50 },
    ],
    descriptionPL: 'Odkryto źródło geotermalne! +50⚡',
    descriptionEN: 'Geothermal source discovered! +50⚡',
  },

  favorable_winds: {
    id:          'favorable_winds',
    namePL:      'Sprzyjający wiatr słoneczny',
    nameEN:      'Favorable Solar Wind',
    category:    'discovery',
    icon:        '💨',
    severity:    'info',
    weight:      6,
    duration:    10,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'energy', multiplier: 1.25 },
    ],
    descriptionPL: 'Sprzyjający wiatr słoneczny! +25% produkcji energii przez 10 lat.',
    descriptionEN: 'Favorable solar wind! +25% energy production for 10 years.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  C. ZDARZENIA SPOŁECZNE
  // ═══════════════════════════════════════════════════════════════════════

  baby_boom: {
    id:          'baby_boom',
    namePL:      'Wyż demograficzny',
    nameEN:      'Baby Boom',
    category:    'social',
    icon:        '👶',
    severity:    'info',
    weight:      5,
    duration:    5,
    defenseTag:  null,
    condition:   (col) => (col?.prosperitySystem?.prosperity ?? 0) >= 70,
    effects: [
      { type: 'pop', delta: 1 },
      { type: 'prosperity', delta: 5 },
    ],
    descriptionPL: 'Wyż demograficzny! +1 POP, dobrobyt wzrasta.',
    descriptionEN: 'Baby boom! +1 POP, prosperity rises.',
  },

  colonist_revolt: {
    id:          'colonist_revolt',
    namePL:      'Bunt kolonistów',
    nameEN:      'Colonist Revolt',
    category:    'social',
    icon:        '✊',
    severity:    'danger',
    weight:      4,
    duration:    3,
    defenseTag:  null,
    condition:   (col) => (col?.prosperitySystem?.prosperity ?? 50) < 30,
    effects: [
      { type: 'production', resource: 'all', multiplier: 0.5 },
      { type: 'prosperity', delta: -10 },
    ],
    descriptionPL: 'Koloniści buntują się! Produkcja spada o 50% na 3 lata.',
    descriptionEN: 'Colonists revolt! Production drops by 50% for 3 years.',
  },

  innovation: {
    id:          'innovation',
    namePL:      'Innowacja',
    nameEN:      'Innovation',
    category:    'social',
    icon:        '💡',
    severity:    'info',
    weight:      5,
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'research', amount: 80 },
      { type: 'prosperity', delta: 5 },
    ],
    descriptionPL: 'Przełomowa innowacja! +80🔬 i +5 dobrobytu.',
    descriptionEN: 'Breakthrough innovation! +80🔬 and +5 prosperity.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  D. ZDARZENIA KOSMICZNE
  // ═══════════════════════════════════════════════════════════════════════

  comet_flyby: {
    id:          'comet_flyby',
    namePL:      'Przelot komety',
    nameEN:      'Comet Flyby',
    category:    'cosmic',
    icon:        '☄',
    severity:    'info',
    weight:      6,
    duration:    0,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'water', amount: 50 },
      { type: 'resource', resource: 'research', amount: 20 },
      { type: 'prosperity', delta: 3 },
    ],
    descriptionPL: 'Kometa przelatuje w pobliżu! +50💧 +20🔬 ze zbierania materiału i obserwacji.',
    descriptionEN: 'A comet flies nearby! +50💧 +20🔬 from material collection and observations.',
  },

  eclipse: {
    id:          'eclipse',
    namePL:      'Zaćmienie',
    nameEN:      'Eclipse',
    category:    'cosmic',
    icon:        '🌑',
    severity:    'info',
    weight:      5,
    duration:    1,
    defenseTag:  null,
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'energy', multiplier: 0.5 },
      { type: 'prosperity', delta: 5 },
    ],
    descriptionPL: 'Zaćmienie! Produkcja energii -50% na 1 rok, ale +5 dobrobytu (spektakl).',
    descriptionEN: 'Eclipse! Energy production -50% for 1 year, but +5 prosperity (spectacle).',
  },
};

// Tablica zdarzeń z wagą > 0 (losowalne)
export const DRAWABLE_EVENTS = Object.values(RANDOM_EVENTS).filter(e => e.weight > 0);

// Suma wag (do normalizacji prawdopodobieństwa)
export const TOTAL_WEIGHT = DRAWABLE_EVENTS.reduce((s, e) => s + e.weight, 0);
