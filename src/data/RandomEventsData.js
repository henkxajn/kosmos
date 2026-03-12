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
//   category:    kategoria ('natural' | 'discovery' | 'social' | 'cosmic')
//   weight:      prawdopodobieństwo (wyższe = częstsze)
//   condition:   funkcja(colony, gameState) → bool — czy zdarzenie może zajść
//   duration:    czas trwania w latach (0 = jednorazowe)
//   effects:     tablica efektów:
//     { type: 'resource', resource, amount }           — jednorazowa zmiana
//     { type: 'production', resource, multiplier }     — mnożnik produkcji na czas trwania
//     { type: 'morale', delta }                        — zmiana morale
//     { type: 'pop', delta }                           — zmiana populacji
//     { type: 'building_damage', count }               — zniszczenie N losowych budynków
//     { type: 'hex_change', terrain, count }            — zmiana N hexów na inny teren
//     { type: 'anomaly', anomalyType }                 — dodaj anomalię na losowy hex
//   description: opis po polsku (dla EventLog)
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
    category:    'natural',
    icon:        '☄',
    severity:    'danger',
    weight:      8,
    duration:    3,
    condition:   () => true,  // może zajść zawsze
    effects: [
      { type: 'production', resource: 'all', multiplier: 0.8 },
      { type: 'morale', delta: -8 },
      { type: 'building_damage', count: 1, chance: 0.3 },
    ],
    description: 'Deszcz meteorów uderza w kolonię! Produkcja spada o 20% na 3 lata.',
  },

  solar_flare: {
    id:          'solar_flare',
    namePL:      'Rozbłysk słoneczny',
    category:    'natural',
    icon:        '☀',
    severity:    'warning',
    weight:      6,
    duration:    3,
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'energy', multiplier: 0.7 },
      { type: 'morale', delta: -5 },
    ],
    description: 'Potężny rozbłysk gwiazdy zakłóca systemy energetyczne. -30% energii na 3 lata.',
  },

  earthquake: {
    id:          'earthquake',
    namePL:      'Trzęsienie gruntu',
    category:    'natural',
    icon:        '🌋',
    severity:    'danger',
    weight:      5,
    duration:    0,
    condition:   (col) => col?.planet?.planetType === 'rocky',
    effects: [
      { type: 'building_damage', count: 1, chance: 0.5 },
      { type: 'morale', delta: -10 },
    ],
    description: 'Silne trzęsienie gruntu! Budynki mogą ulec zniszczeniu.',
  },

  epidemic: {
    id:          'epidemic',
    namePL:      'Epidemia',
    category:    'natural',
    icon:        '🦠',
    severity:    'danger',
    weight:      4,
    duration:    5,
    condition:   (col) => (col?.civSystem?.population ?? 0) >= 5,
    effects: [
      { type: 'pop', delta: -1 },
      { type: 'morale', delta: -15 },
      { type: 'production', resource: 'organics', multiplier: 0.7 },
    ],
    description: 'Epidemia! Populacja traci 1 POPa, morale spada, produkcja żywności -30% na 5 lat.',
  },

  volcanic_eruption: {
    id:          'volcanic_eruption',
    namePL:      'Erupcja wulkanu',
    category:    'natural',
    icon:        '🌋',
    severity:    'danger',
    weight:      3,
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'hex_change', terrain: 'volcano', count: 2 },
      { type: 'morale', delta: -5 },
      { type: 'resource', resource: 'minerals', amount: 50 },
    ],
    description: 'Erupcja wulkaniczna! Nowe wulkany powstają na mapie, ale wyrzucono minerały.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  B. ODKRYCIA I SZANSE
  // ═══════════════════════════════════════════════════════════════════════

  mineral_deposit: {
    id:          'mineral_deposit',
    namePL:      'Odkrycie złóż',
    category:    'discovery',
    icon:        '💎',
    severity:    'info',
    weight:      10,
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'minerals', amount: 200 },
    ],
    description: 'Odkryto bogate złoża minerałów! +200⛏',
  },

  scientific_anomaly: {
    id:          'scientific_anomaly',
    namePL:      'Anomalia naukowa',
    category:    'discovery',
    icon:        '✦',
    severity:    'info',
    weight:      7,
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'research', amount: 100 },
      { type: 'anomaly', anomalyType: 'scientific' },
    ],
    description: 'Wykryto anomalię naukową! +100🔬 i nowa anomalia na mapie do zbadania.',
    chainId:     'anomaly_chain',
    chainNext:   'anomaly_resolution',
    chainDelay:  5,
  },

  anomaly_resolution: {
    id:          'anomaly_resolution',
    namePL:      'Zbadano anomalię',
    category:    'discovery',
    icon:        '🔍',
    severity:    'info',
    weight:      0,   // 0 = nie losowane, tylko jako chain
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'research', amount: 200 },
    ],
    description: 'Anomalię zbadano! Odkryto starożytne struktury. +200🔬',
  },

  geothermal_source: {
    id:          'geothermal_source',
    namePL:      'Źródło geotermalne',
    category:    'discovery',
    icon:        '♨',
    severity:    'info',
    weight:      5,
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'energy', amount: 50 },
      { type: 'hex_change', terrain: 'volcano', count: 1 },
    ],
    description: 'Odkryto źródło geotermalne! +50⚡ i nowe pole wulkaniczne na mapie.',
  },

  favorable_winds: {
    id:          'favorable_winds',
    namePL:      'Sprzyjający wiatr słoneczny',
    category:    'discovery',
    icon:        '💨',
    severity:    'info',
    weight:      6,
    duration:    10,
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'energy', multiplier: 1.25 },
    ],
    description: 'Sprzyjający wiatr słoneczny! +25% produkcji energii przez 10 lat.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  C. ZDARZENIA SPOŁECZNE
  // ═══════════════════════════════════════════════════════════════════════

  baby_boom: {
    id:          'baby_boom',
    namePL:      'Wyż demograficzny',
    category:    'social',
    icon:        '👶',
    severity:    'info',
    weight:      5,
    duration:    5,
    condition:   (col) => (col?.prosperitySystem?.prosperity ?? 0) >= 70,
    effects: [
      { type: 'pop', delta: 1 },
      { type: 'morale', delta: 5 },
    ],
    description: 'Wyż demograficzny! +1 POP, morale wzrasta.',
  },

  colonist_revolt: {
    id:          'colonist_revolt',
    namePL:      'Bunt kolonistów',
    category:    'social',
    icon:        '✊',
    severity:    'danger',
    weight:      4,
    duration:    3,
    condition:   (col) => (col?.prosperitySystem?.prosperity ?? 50) < 30,
    effects: [
      { type: 'production', resource: 'all', multiplier: 0.5 },
      { type: 'morale', delta: -10 },
    ],
    description: 'Kolonisti buntują się! Produkcja spada o 50% na 3 lata.',
  },

  innovation: {
    id:          'innovation',
    namePL:      'Innowacja',
    category:    'social',
    icon:        '💡',
    severity:    'info',
    weight:      5,
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'research', amount: 80 },
      { type: 'morale', delta: 5 },
    ],
    description: 'Przełomowa innowacja! +80🔬 i +5 morale.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  D. ZDARZENIA KOSMICZNE
  // ═══════════════════════════════════════════════════════════════════════

  comet_flyby: {
    id:          'comet_flyby',
    namePL:      'Przelot komety',
    category:    'cosmic',
    icon:        '☄',
    severity:    'info',
    weight:      6,
    duration:    0,
    condition:   () => true,
    effects: [
      { type: 'resource', resource: 'water', amount: 50 },
      { type: 'resource', resource: 'research', amount: 20 },
      { type: 'morale', delta: 3 },
    ],
    description: 'Kometa przelatuje w pobliżu! +50💧 +20🔬 ze zbierania materiału i obserwacji.',
  },

  eclipse: {
    id:          'eclipse',
    namePL:      'Zaćmienie',
    category:    'cosmic',
    icon:        '🌑',
    severity:    'info',
    weight:      5,
    duration:    1,
    condition:   () => true,
    effects: [
      { type: 'production', resource: 'energy', multiplier: 0.5 },
      { type: 'morale', delta: 5 },
    ],
    description: 'Zaćmienie! Produkcja energii -50% na 1 rok, ale +5 morale (spektakl).',
  },
};

// Tablica zdarzeń z wagą > 0 (losowalne)
export const DRAWABLE_EVENTS = Object.values(RANDOM_EVENTS).filter(e => e.weight > 0);

// Suma wag (do normalizacji prawdopodobieństwa)
export const TOTAL_WEIGHT = DRAWABLE_EVENTS.reduce((s, e) => s + e.weight, 0);
