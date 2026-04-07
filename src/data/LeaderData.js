// LeaderData — dane liderów (Faza B → C4)
//
// Faza C4: na starcie gry frakcje NIE istnieją — gracz wybiera tylko styl
// przywództwa (archetype). Pole `hidden_faction` jest niewidoczne w UI i
// zostaje użyte przez FactionSystem dopiero gdy frakcje się odblokują
// (po odkryciu Ziemi). Stare pole `faction` zachowane TYLKO dla Viktora
// i Amary — to są pełnoprawni Konsulowie post-unlock.
//
// 8 postaci łącznie:
//   STARTING_LEADERS (6) — wybierane na starcie gry, neutralne cytaty
//     • yara_osei, aleksei_borodin, mirela_santos (hidden: confederates)
//     • fatima_alrashidi, tomas_ferreira, ingrid_solberg (hidden: seekers)
//   Konsulowie post-unlock (Viktor, Amara) — tylko w wyborach co 15 lat

export const FACTIONS = {
  confederates: {
    id:     'confederates',
    namePL: 'Konfederaci Misji',
    nameEN: 'Confederation of the Mission',
    motto:  'Jesteśmy tu na zawsze. To jest nasz dom.',
    mottoEN: 'We are here forever. This is our home.',
    color:  '#378ADD',
    system: 'archon',  // dożywotni przywódca
    bonuses: {
      colonizationEfficiency: 0.20,
      populationBuildingCost: -0.15,
    },
    maluses: {
      ftlResearch: -0.30,
    },
  },
  seekers: {
    id:     'seekers',
    namePL: 'Poszukiwacze Drogi',
    nameEN: 'Seekers of the Way',
    motto:  'Dom jest tam skąd przyszliśmy.',
    mottoEN: 'Home is where we came from.',
    color:  '#D85A30',
    system: 'consul',  // wybory co 15 lat
    bonuses: {
      ftlResearch:    0.40,
      energyResearch: 0.40,
    },
    maluses: {
      colonyMorale: -0.20,
    },
  },
};

export const LEADERS = {
  // ── STARTERY — 6 liderów do wyboru przy nowej grze ─────────────────────
  // hidden_faction: niewidoczne w UI; FactionSystem użyje gdy frakcje się odblokują
  yara_osei: {
    id:             'yara_osei',
    hidden_faction: 'confederates',
    archetype:      'Wizjoner Nauki',
    archetypeEN:    'Science Visionary',
    namePL:         'Dr. Yara Osei-Mensah',
    titlePL:        'Dyrektor Naukowy Misji',
    titleEN:        'Mission Science Director',
    age:            44,
    quote:          'Jesteśmy pierwszymi ludźmi którzy widzą to niebo. Każde odkrycie które tu zrobimy — należy do całej ludzkości.',
    quoteEN:        'We are the first humans to see this sky. Every discovery we make here belongs to all of humanity.',
    portrait:       'assets/portraits/yara_osei.png',
    bonuses: [
      { stat: 'research',         mult: 1.25, descPL: '+25% badania naukowe',           descEN: '+25% research output' },
      { stat: 'colonyProsperity', mult: 1.15, descPL: '+15% prosperity nowych kolonii', descEN: '+15% new colony prosperity' },
      { stat: 'anomalyResearch',  mult: 2.0,  descPL: 'Anomalie ×2 research',           descEN: 'Anomalies ×2 research' },
    ],
    maluses: [],   // brak malusów na starcie — frakcja nieznana
  },

  aleksei_borodin: {
    id:             'aleksei_borodin',
    hidden_faction: 'confederates',
    archetype:      'Pragmatyk Stabilności',
    archetypeEN:    'Stability Pragmatist',
    namePL:         'Komandor Aleksei Borodin-Vasek',
    titlePL:        'Komandor Bezpieczeństwa Misji',
    titleEN:        'Mission Security Commander',
    age:            51,
    quote:          'Mam 400 000 dusz pod opieką. Dopóki żyją — mam czas na pytania. Najpierw przeżyją.',
    quoteEN:        'I have 400,000 souls in my care. As long as they live — I have time for questions. Survival comes first.',
    portrait:       'assets/portraits/aleksei_borodin.png',
    bonuses: [
      { stat: 'stabilityFloor', value: 40,   descPL: 'Morale nie spada poniżej 40',  descEN: 'Morale cannot drop below 40' },
      { stat: 'defenseCost',    mult: 0.75,  descPL: 'Budynki obronne -25% koszt',    descEN: 'Defense buildings -25% cost' },
      { stat: 'crisisDuration', mult: 0.60,  descPL: 'Kryzysy trwają 40% krócej',     descEN: 'Crises last 40% shorter' },
    ],
    maluses: [],
  },

  mirela_santos: {
    id:             'mirela_santos',
    hidden_faction: 'confederates',
    archetype:      'Humanista Wspólnoty',
    archetypeEN:    'Community Humanist',
    namePL:         'Mirela Santos-Ikeda',
    titlePL:        'Dyrektor Systemów Społecznych',
    titleEN:        'Social Systems Director',
    age:            38,
    quote:          'Zabraliśmy ze sobą wszystko co czyni nas ludźmi. Teraz musimy sprawdzić czy to wystarczy.',
    quoteEN:        'We brought with us everything that makes us human. Now we must find out if that is enough.',
    portrait:       'assets/portraits/mirela_santos.png',
    bonuses: [
      { stat: 'popGrowth',     mult: 1.35, descPL: '+35% wzrost populacji',            descEN: '+35% population growth' },
      { stat: 'consumerGoods', mult: 1.40, descPL: 'Dobra konsumpcyjne +40% szybciej', descEN: 'Consumer goods +40% faster' },
      { stat: 'prosperity',    mult: 1.25, descPL: 'Prosperity rośnie +25% szybciej',  descEN: 'Prosperity grows +25% faster' },
    ],
    maluses: [],
  },

  // ── STARTERY (Seekers hidden) — także rotują jako Konsulowie post-unlock ──
  fatima_alrashidi: {
    id:             'fatima_alrashidi',
    hidden_faction: 'seekers',
    archetype:      'Obsesyjny Odkrywca',
    archetypeEN:    'Obsessive Explorer',
    namePL:         'Dr. Fatima Al-Rashidi',
    titlePL:        'Główny Fizyk Anomalii',
    titleEN:        'Chief Anomaly Physicist',
    age:            47,
    quote:          'Anomalia skoku to nie wypadek. To równanie które czeka na rozwiązanie. Ja je rozwiążę.',
    quoteEN:        'The jump anomaly is not an accident. It is an equation waiting to be solved. I will solve it.',
    portrait:       'assets/portraits/fatima_alrashidi.png',
    termYears:      15,    // post-unlock: rotacja Konsulów co 15 lat
    bonuses: [
      { stat: 'ftlResearch',       mult: 2.0,  descPL: '×2 badania FTL',                   descEN: '×2 FTL research' },
      { stat: 'temporalAnomalies', mult: 2.0,  descPL: 'Anomalie temporalne ×2 częściej',  descEN: 'Temporal anomalies ×2 more frequent' },
      { stat: 'research',          mult: 1.15, descPL: '+15% badania ogólne',              descEN: '+15% general research' },
    ],
    maluses: [],
  },

  tomas_ferreira: {
    id:             'tomas_ferreira',
    hidden_faction: 'seekers',
    archetype:      'Kapitan Eksploracji',
    archetypeEN:    'Captain of Exploration',
    namePL:         'Tomás Ferreira-Okonkwo',
    titlePL:        'Admirał Floty Kolonizacyjnej',
    titleEN:        'Admiral of Colonial Fleet',
    age:            55,
    quote:          'Nie wiemy gdzie jesteśmy. Ale wiem jak to sprawdzić. Lecimy.',
    quoteEN:        'We do not know where we are. But I know how to find out. We fly.',
    portrait:       'assets/portraits/tomas_ferreira.png',
    termYears:      15,
    bonuses: [
      { stat: 'shipRange',     mult: 1.50, descPL: 'Statki +50% zasięg',         descEN: 'Ships +50% range' },
      { stat: 'shipSpeed',     mult: 1.40, descPL: 'Statki +40% szybkość',       descEN: 'Ships +40% speed' },
      { stat: 'anomalyChance', mult: 2.0,  descPL: 'Anomalie ×2 szansa odkrycia', descEN: 'Anomalies ×2 discovery chance' },
    ],
    maluses: [],
  },

  ingrid_solberg: {
    id:             'ingrid_solberg',
    hidden_faction: 'seekers',
    archetype:      'Dyplomata Jedności',
    archetypeEN:    'Unity Diplomat',
    namePL:         'Ingrid Solberg-Nakamura',
    titlePL:        'Pełnomocnik ds. Spójności Społecznej',
    titleEN:        'Commissioner for Social Cohesion',
    age:            41,
    quote:          'Czterysta tysięcy ludzi, jedno pytanie: co teraz? Moja odpowiedź: najpierw przestańcie się kłócić.',
    quoteEN:        'Four hundred thousand people, one question: what now? My answer: first stop arguing.',
    portrait:       'assets/portraits/ingrid_solberg.png',
    termYears:      15,
    bonuses: [
      { stat: 'factionTension', mult: 0.5,  descPL: 'Napięcie frakcji -50%',  descEN: 'Faction tension -50%' },
      { stat: 'morale',         mult: 1.20, descPL: '+20% morale globalne',   descEN: '+20% global morale' },
      { stat: 'crisisDuration', mult: 0.70, descPL: 'Kryzysy trwają 30% krócej', descEN: 'Crises last 30% shorter' },
    ],
    maluses: [],
  },

  viktor_havel: {
    id:        'viktor_havel',
    faction:   'seekers',
    namePL:    'Dr. Viktor Havel-Osei',
    titlePL:   'Konsul — Projekt Kardaszow',
    titleEN:   'Consul — Kardashev Project',
    age:       49,
    quote:     'Energia rozwiązuje wszystkie problemy. Wszystkie. Bez wyjątku. Dajcie mi reaktory.',
    quoteEN:   'Energy solves all problems. All of them. Without exception. Give me reactors.',
    portrait:  'assets/portraits/viktor_havel.png',
    termYears: 15,
    program:   'kardashev_project',
    programDescPL: 'Projekt Kardaszow',
    programDescEN: 'Kardashev Project',
    bonuses: [
      { stat: 'energyOutput',  mult: 1.60, descPL: '+60% output reaktorów',        descEN: '+60% reactor output' },
      { stat: 'dysonProgress', mult: 3.0,  descPL: 'Sfera Dysona ×3 szybciej',     descEN: 'Dyson Sphere ×3 faster' },
    ],
    maluses: [
      { stat: 'popGrowth',   mult: 0.85, descPL: '-15% wzrost populacji',     descEN: '-15% population growth' },
      { stat: 'maintenance', mult: 1.30, descPL: '+30% utrzymanie budynków',  descEN: '+30% building maintenance' },
    ],
  },

  amara_diallo: {
    id:        'amara_diallo',
    faction:   'seekers',
    namePL:    'Amara Diallo-Chen',
    titlePL:   'Konsul — Projekt Memoria',
    titleEN:   'Consul — Project Memoria',
    age:       34,
    quote:     'Nie pamiętam Ziemi. Pamiętam opowieści. I właśnie dlatego muszę sprawdzić czy były prawdziwe.',
    quoteEN:   'I don\'t remember Earth. I remember stories. And that is exactly why I must check if they were true.',
    portrait:  'assets/portraits/amara_diallo.png',
    termYears: 15,
    program:   'memoria_project',
    programDescPL: 'Projekt Memoria',
    programDescEN: 'Project Memoria',
    bonuses: [
      { stat: 'morale',            mult: 1.50, descPL: '+50% morale przez kadencję',      descEN: '+50% morale during term' },
      { stat: 'narrativeResearch', mult: 2.0,  descPL: 'Eventy narracyjne ×2 research',   descEN: 'Narrative events ×2 research' },
    ],
    maluses: [
      { stat: 'industryEfficiency', mult: 0.80, descPL: '-20% wydajność przemysłu', descEN: '-20% industry efficiency' },
    ],
  },
};

// Faza C4: 6 starterów do wyboru przy nowej grze (LeaderSelectScene)
// Kolejność: 3 ukryci Konfederaci, 3 ukryci Poszukiwacze (UI ich nie rozróżnia)
export const STARTING_LEADERS = [
  'yara_osei', 'aleksei_borodin', 'mirela_santos',
  'fatima_alrashidi', 'tomas_ferreira', 'ingrid_solberg',
];

// Pomocnicze: lista kandydatów Konfederatów (zachowane dla legacy / przyszłej rotacji Archonta)
export const CONFEDERATE_CANDIDATES = ['yara_osei', 'aleksei_borodin', 'mirela_santos'];

// Pomocnicze: lista Konsulów Poszukiwaczy (rotacja co 15 lat post-unlock)
// Wszystkie 5 mogą zostać wylosowanych w wyborach po odblokowaniu frakcji.
export const SEEKER_CONSULS = [
  'fatima_alrashidi',
  'tomas_ferreira',
  'ingrid_solberg',
  'viktor_havel',
  'amara_diallo',
];
