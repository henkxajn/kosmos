// LeaderData — dane frakcji i przywódców (Faza B)
//
// Dwie frakcje: Konfederaci Misji (dożywotni Archont) i Poszukiwacze Drogi (Konsul co 15 lat).
// 8 postaci: 3 kandydatów Konfederatów + 5 Konsulów Poszukiwaczy.

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
  // ── KONFEDERACI — 3 kandydatów do wyboru przy starcie ──────────────────
  yara_osei: {
    id:        'yara_osei',
    faction:   'confederates',
    namePL:    'Dr. Yara Osei-Mensah',
    titlePL:   'Archont Nauki i Ekspansji',
    titleEN:   'Archon of Science and Expansion',
    age:       44,
    quote:     'Ziemia wysłała nas żebyśmy przeżyli. Przeżyjmy — i zbudujmy coś godnego tego poświęcenia.',
    quoteEN:   'Earth sent us to survive. Let us survive — and build something worthy of that sacrifice.',
    portrait:  'assets/portraits/yara_osei.png',
    bonuses: [
      { stat: 'research',        mult: 1.25, descPL: '+25% badania naukowe',           descEN: '+25% research output' },
      { stat: 'colonyProsperity',mult: 1.15, descPL: '+15% prosperity nowych kolonii', descEN: '+15% new colony prosperity' },
      { stat: 'anomalyResearch', mult: 2.0,  descPL: 'Anomalie naukowe ×2 research',   descEN: 'Science anomalies ×2 research' },
    ],
    maluses: [
      { stat: 'seekersMorale', mult: 0.85, descPL: '-15% morale Poszukiwaczy', descEN: '-15% Seekers morale' },
    ],
  },

  aleksei_borodin: {
    id:        'aleksei_borodin',
    faction:   'confederates',
    namePL:    'Komandor Aleksei Borodin-Vasek',
    titlePL:   'Archont Stabilności i Porządku',
    titleEN:   'Archon of Stability and Order',
    age:       51,
    quote:     'Mam 400 000 dusz pod opieką. Najpierw przeżyją. Potem będziemy filozofować.',
    quoteEN:   'I have 400,000 souls in my care. First they survive. Then we philosophize.',
    portrait:  'assets/portraits/aleksei_borodin.png',
    bonuses: [
      { stat: 'stabilityFloor', value: 40,   descPL: 'Morale nie spada poniżej 40',    descEN: 'Morale cannot drop below 40' },
      { stat: 'defenseCost',    mult: 0.75,  descPL: 'Budynki obronne -25% koszt',      descEN: 'Defense buildings -25% cost' },
      { stat: 'crisisDuration', mult: 0.60,  descPL: 'Kryzysy trwają 40% krócej',       descEN: 'Crises last 40% shorter' },
    ],
    maluses: [
      { stat: 'research',        mult: 0.80, descPL: '-20% badania naukowe',       descEN: '-20% research output' },
      { stat: 'seekersTension',  mult: 2.0,  descPL: 'Poszukiwacze ×2 napięcia',  descEN: 'Seekers ×2 tension' },
    ],
  },

  mirela_santos: {
    id:        'mirela_santos',
    faction:   'confederates',
    namePL:    'Mirela Santos-Ikeda',
    titlePL:   'Archont Wspólnoty i Dobrobytu',
    titleEN:   'Archon of Community and Prosperity',
    age:       38,
    quote:     'Pytali mnie ile ludzi zmieści się na tym statku. Pytałam ich — ile społeczeństw? Jedno. Tylko jedno.',
    quoteEN:   'They asked me how many people fit on this ship. I asked them — how many societies? One. Just one.',
    portrait:  'assets/portraits/mirela_santos.png',
    bonuses: [
      { stat: 'popGrowth',       mult: 1.35, descPL: '+35% wzrost populacji',              descEN: '+35% population growth' },
      { stat: 'consumerGoods',   mult: 1.40, descPL: 'Dobra konsumpcyjne +40% szybciej',   descEN: 'Consumer goods +40% faster' },
      { stat: 'prosperity',      mult: 1.25, descPL: 'Prosperity rośnie +25% szybciej',    descEN: 'Prosperity grows +25% faster' },
    ],
    maluses: [
      { stat: 'miningEfficiency',mult: 0.90, descPL: '-10% wydajność wydobycia',   descEN: '-10% mining efficiency' },
      { stat: 'megaprojectCost', mult: 1.20, descPL: 'Megaprojekty +20% droższe',  descEN: 'Megaprojects +20% more expensive' },
    ],
  },

  // ── POSZUKIWACZE — 5 Konsulów rotujących co 15 lat ─────────────────────
  fatima_alrashidi: {
    id:        'fatima_alrashidi',
    faction:   'seekers',
    namePL:    'Dr. Fatima Al-Rashidi',
    titlePL:   'Konsul — Projekt Genesis',
    titleEN:   'Consul — Project Genesis',
    age:       47,
    quote:     'Widziałam jak przestrzeń się złożyła. To nie był wypadek. To było zaproszenie.',
    quoteEN:   'I saw space fold in on itself. It was not an accident. It was an invitation.',
    portrait:  'assets/portraits/fatima_alrashidi.png',
    termYears: 15,
    program:   'project_genesis',
    programDescPL: 'Projekt Genesis — rozumienie skoku',
    programDescEN: 'Project Genesis — understanding the jump',
    bonuses: [
      { stat: 'ftlResearch',       mult: 3.0, descPL: '×3 badania FTL przez 15 lat',     descEN: '×3 FTL research for 15 years' },
      { stat: 'temporalAnomalies', mult: 2.0, descPL: 'Anomalie temporalne ×2 częściej',  descEN: 'Temporal anomalies ×2 more frequent' },
    ],
    maluses: [
      { stat: 'consumerGoods',      mult: 0.75, descPL: '-25% produkcja dóbr',          descEN: '-25% consumer goods production' },
      { stat: 'confederateTension', value: 20,   descPL: '+20 napięcia Konfederatów',    descEN: '+20 Confederate tension' },
    ],
  },

  tomas_ferreira: {
    id:        'tomas_ferreira',
    faction:   'seekers',
    namePL:    'Tomás Ferreira-Okonkwo',
    titlePL:   'Konsul — Wielka Ekspedycja',
    titleEN:   'Consul — The Great Expedition',
    age:       55,
    quote:     'Odpowiedź jest tam. Nie wiem gdzie dokładnie. Dlatego lecimy wszędzie.',
    quoteEN:   'The answer is out there. I don\'t know exactly where. That\'s why we fly everywhere.',
    portrait:  'assets/portraits/tomas_ferreira.png',
    termYears: 15,
    program:   'great_expedition',
    programDescPL: 'Wielka Ekspedycja',
    programDescEN: 'The Great Expedition',
    bonuses: [
      { stat: 'shipRange',     mult: 1.50, descPL: 'Statki +50% zasięg',          descEN: 'Ships +50% range' },
      { stat: 'shipSpeed',     mult: 1.40, descPL: 'Statki +40% szybkość',        descEN: 'Ships +40% speed' },
      { stat: 'anomalyChance', mult: 3.0,  descPL: 'Anomalie temporalne ×3 szansa', descEN: 'Temporal anomalies ×3 chance' },
    ],
    maluses: [
      { stat: 'transportEfficiency', mult: 0.70, descPL: 'Transport -30% wydajność', descEN: 'Transport -30% efficiency' },
    ],
  },

  ingrid_solberg: {
    id:        'ingrid_solberg',
    faction:   'seekers',
    namePL:    'Ingrid Solberg-Nakamura',
    titlePL:   'Konsul — Wielka Zgoda',
    titleEN:   'Consul — The Great Accord',
    age:       41,
    quote:     'Możemy się kłócić przez tysiąc lat. Albo możemy zbudować statek który nas tam zawiezie.',
    quoteEN:   'We can argue for a thousand years. Or we can build a ship that will take us there.',
    portrait:  'assets/portraits/ingrid_solberg.png',
    termYears: 15,
    program:   'great_accord',
    programDescPL: 'Wielka Zgoda',
    programDescEN: 'The Great Accord',
    bonuses: [
      { stat: 'factionTension', mult: 0.5,  descPL: 'Napięcie frakcji -50%',  descEN: 'Faction tension -50%' },
      { stat: 'morale',         mult: 1.20, descPL: '+20% morale globalne',   descEN: '+20% global morale' },
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

// Pomocnicze: lista kandydatów Konfederatów
export const CONFEDERATE_CANDIDATES = ['yara_osei', 'aleksei_borodin', 'mirela_santos'];

// Pomocnicze: lista Konsulów Poszukiwaczy (rotacja)
export const SEEKER_CONSULS = [
  'fatima_alrashidi',  // zawsze pierwsza kadencja
  'tomas_ferreira',
  'ingrid_solberg',
  'viktor_havel',
  'amara_diallo',
];
