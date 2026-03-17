// DiscoveryData — definicje 15 odkryć naukowych
//
// Każde odkrycie ma warunki (typ ciała, tech, odległość),
// bazową szansę per misja naukowa, oraz efekty natychmiastowe.
// Odkrycia są unikalne — raz odkryte, nie powtarzają się.

/**
 * @typedef {object} Discovery
 * @property {string} id — unikalny identyfikator
 * @property {string} namePL — nazwa po polsku
 * @property {string} nameEN — nazwa po angielsku
 * @property {string} descriptionPL — opis fabularny PL
 * @property {string} descriptionEN — opis fabularny EN
 * @property {object} conditions — warunki pojawienia się
 * @property {string[]} [conditions.bodyType] — typy ciał (planet, moon, planetoid, asteroid, comet)
 * @property {string[]} [conditions.planetType] — podtyp planety (rocky, ice, gas, volcanic)
 * @property {string} [conditions.requiredTech] — tech wymagany do pojawienia się
 * @property {number} [conditions.minDistance] — min odległość od gwiazdy (AU)
 * @property {number} [conditions.maxDistance] — max odległość od gwiazdy (AU)
 * @property {number} [conditions.minLifeScore] — min lifeScore ciała
 * @property {number} [conditions.minPlanets] — min planet w układzie
 * @property {number} chance — bazowy % per misja naukowa
 * @property {object} effects — efekty odkrycia
 * @property {number} [effects.research] — bonus research natychmiastowy
 * @property {number} [effects.prosperity] — bonus prosperity permanentny
 * @property {string[]} [effects.unlockTech] — tech odblokowane (discovery soft-gate)
 * @property {string} [effects.deposit] — nowy deposit na celu (resourceId)
 * @property {number} [effects.depositRichness] — richness nowego depositu
 * @property {boolean} [effects.milestone] — czy to prestiżowe odkrycie (milestone)
 * @property {string} [effects.milestoneId] — id milestone
 */

export const DISCOVERIES = {
  extremofil_lodowy: {
    id: 'extremofil_lodowy',
    namePL: 'Extremofil Lodowy',
    nameEN: 'Ice Extremophile',
    descriptionPL: 'Odkryto mikroorganizm zdolny do przetrwania w ekstremalnym zimnie. Otwiera drogę do badań nad kriogeniką i hibernacją załóg.',
    descriptionEN: 'A microorganism capable of surviving extreme cold has been discovered. This opens the path to cryogenics and crew hibernation research.',
    conditions: {
      bodyType: ['comet', 'moon'],
      planetType: ['ice'],
    },
    chance: 15,
    effects: {
      research: 100,
      unlockTech: ['cryogenics'],
    },
  },

  anomalia_kwantowa: {
    id: 'anomalia_kwantowa',
    namePL: 'Anomalia Kwantowa',
    nameEN: 'Quantum Anomaly',
    descriptionPL: 'Wykryto anomalię w strukturze kwantowej minerałów planetoidu. Dane pozwalają na przełom w obliczeniach kwantowych i nanofabrykacji.',
    descriptionEN: 'A quantum anomaly in the mineral structure of a planetoid has been detected. The data enables breakthroughs in quantum computing and nanofabrication.',
    conditions: {
      bodyType: ['planetoid'],
      planetType: ['metallic'],
    },
    chance: 10,
    effects: {
      research: 150,
      unlockTech: ['quantum_computing', 'nanofabrication'],
    },
  },

  pulapka_antymaterii: {
    id: 'pulapka_antymaterii',
    namePL: 'Zbiornik Antymaterii',
    nameEN: 'Antimatter Pocket',
    descriptionPL: 'Naturalny zbiornik antymaterii uwięzionej w polu magnetycznym księżyca gazowego olbrzyma. Bezcenne dane do opanowania technologii antymaterii.',
    descriptionEN: 'A natural antimatter pocket trapped in the magnetic field of a gas giant moon. Invaluable data for mastering antimatter technology.',
    conditions: {
      bodyType: ['moon'],
    },
    chance: 8,
    effects: {
      research: 200,
      unlockTech: ['antimatter_containment'],
    },
  },

  zakrzywienie_czasoprzestrzeni: {
    id: 'zakrzywienie_czasoprzestrzeni',
    namePL: 'Anomalia Grawitacyjna',
    nameEN: 'Gravity Anomaly',
    descriptionPL: 'Blisko gwiazdy wykryto lokalne zakrzywienie czasoprzestrzeni — mikroskopijną anomalię grawitacyjną. Klucz do teorii napędu skokowego.',
    descriptionEN: 'A local spacetime curvature near the star has been detected — a microscopic gravitational anomaly. The key to warp drive theory.',
    conditions: {
      maxDistance: 0.5,
    },
    chance: 5,
    effects: {
      research: 300,
      unlockTech: ['warp_theory'],
    },
  },

  rezonans_grawitacyjny: {
    id: 'rezonans_grawitacyjny',
    namePL: 'Rezonans Orbitalny',
    nameEN: 'Orbital Resonance',
    descriptionPL: 'Układ planet wykazuje rzadki rezonans orbitalny — ich wzajemne oddziaływanie grawitacyjne tworzy stabilną superpozycję. Dane kluczowe dla megastruktur.',
    descriptionEN: 'The planetary system exhibits a rare orbital resonance — their gravitational interaction creates a stable superposition. Key data for megastructures.',
    conditions: {
      minPlanets: 4,
    },
    chance: 12,
    effects: {
      research: 100,
      unlockTech: ['megastructures'],
    },
  },

  fluktuacje_kwantowe: {
    id: 'fluktuacje_kwantowe',
    namePL: 'Fluktuacje Próżni',
    nameEN: 'Vacuum Fluctuations',
    descriptionPL: 'Zaobserwowano mierzalne fluktuacje energii próżni — potwierdzenie teoretycznych przewidywań fizyki kwantowej. Możliwość pozyskiwania energii z próżni.',
    descriptionEN: 'Measurable vacuum energy fluctuations have been observed — confirming theoretical predictions of quantum physics. The possibility of extracting energy from vacuum.',
    conditions: {
      requiredTech: 'quantum_physics',
    },
    chance: 5,
    effects: {
      research: 400,
      unlockTech: ['zero_point_energy'],
    },
  },

  manipulacja_pol: {
    id: 'manipulacja_pol',
    namePL: 'Koherentne Pole EM',
    nameEN: 'Coherent EM Field',
    descriptionPL: 'Wulkaniczny księżyc emituje koherentne pole elektromagnetyczne — naturalne pole siłowe. Analiza pozwala na replikację zjawiska.',
    descriptionEN: 'A volcanic moon emits a coherent electromagnetic field — a natural force field. Analysis allows replication of the phenomenon.',
    conditions: {
      bodyType: ['moon'],
      planetType: ['volcanic'],
    },
    chance: 8,
    effects: {
      research: 200,
      unlockTech: ['force_fields'],
    },
  },

  anihilacja_kontrolowana: {
    id: 'anihilacja_kontrolowana',
    namePL: 'Kontrolowana Anihilacja',
    nameEN: 'Controlled Annihilation',
    descriptionPL: 'Udało się zaobserwować kontrolowany proces anihilacji materia-antymateria w warunkach kosmicznych. Kluczowe dane do napędu antymaterii.',
    descriptionEN: 'A controlled matter-antimatter annihilation process has been observed in space conditions. Key data for antimatter propulsion.',
    conditions: {
      requiredTech: 'antimatter_containment',
    },
    chance: 15,
    effects: {
      research: 250,
      unlockTech: ['antimatter_propulsion'],
    },
  },

  krysztaly_piezo: {
    id: 'krysztaly_piezo',
    namePL: 'Kryształy Piezoelektryczne',
    nameEN: 'Piezoelectric Crystals',
    descriptionPL: 'Odkryto bogate złoża kryształów piezoelektrycznych w skale powierzchniowej. Nadają się do produkcji zaawansowanej elektroniki.',
    descriptionEN: 'Rich deposits of piezoelectric crystals have been found in surface rock. They are suitable for advanced electronics production.',
    conditions: {
      bodyType: ['planet', 'moon'],
      planetType: ['rocky', 'ice', 'iron'],
    },
    chance: 20,
    effects: {
      research: 50,
      deposit: 'Si',
      depositRichness: 0.8,
    },
  },

  skamienialosc_obca: {
    id: 'skamienialosc_obca',
    namePL: 'Skamieniałość Pozaziemska',
    nameEN: 'Alien Fossil',
    descriptionPL: 'W skale odkryto ślady starożytnego życia — skamieniałość organizmu sprzed miliardów lat. Nie jesteśmy sami we wszechświecie.',
    descriptionEN: 'Traces of ancient life have been found in rock — a fossil of an organism from billions of years ago. We are not alone in the universe.',
    conditions: {
      bodyType: ['planet'],
      planetType: ['rocky', 'ocean'],
      minLifeScore: 50,
    },
    chance: 3,
    effects: {
      research: 500,
      prosperity: 20,
      milestone: true,
      milestoneId: 'not_alone',
    },
  },

  mineraly_nadprzewodzace: {
    id: 'mineraly_nadprzewodzace',
    namePL: 'Minerały Nadprzewodzące',
    nameEN: 'Superconductor Minerals',
    descriptionPL: 'Odkryto minerały wykazujące nadprzewodnictwo w temperaturze pokojowej. Rewolucyjny materiał do zaawansowanej elektroniki i napędów.',
    descriptionEN: 'Minerals exhibiting room-temperature superconductivity have been discovered. A revolutionary material for advanced electronics and propulsion.',
    conditions: {
      bodyType: ['planetoid', 'asteroid'],
    },
    chance: 12,
    effects: {
      research: 100,
      deposit: 'Pt',
      depositRichness: 0.7,
    },
  },

  biosfera_podziemna: {
    id: 'biosfera_podziemna',
    namePL: 'Podziemna Biosfera',
    nameEN: 'Subterranean Biosphere',
    descriptionPL: 'Pod powierzchnią planety odkryto rozległą sieć podziemnych jaskiń z żywą biosferą. Naturalne ekosystemy gotowe do eksploatacji.',
    descriptionEN: 'An extensive network of underground caves with a living biosphere has been discovered beneath the surface. Natural ecosystems ready for exploitation.',
    conditions: {
      bodyType: ['planet'],
      planetType: ['rocky', 'ice'],
    },
    chance: 8,
    effects: {
      research: 200,
    },
  },

  gejzer_kriogeniczny: {
    id: 'gejzer_kriogeniczny',
    namePL: 'Gejzer Kriogeniczny',
    nameEN: 'Cryogenic Geyser',
    descriptionPL: 'Gejzer kriogeniczny wyrzuca czystą wodę spod lodowej skorupy. Nieograniczone źródło wody dla pobliskich kolonii.',
    descriptionEN: 'A cryogenic geyser ejects pure water from beneath the ice crust. An unlimited water source for nearby colonies.',
    conditions: {
      bodyType: ['comet', 'moon'],
      planetType: ['ice'],
    },
    chance: 18,
    effects: {
      research: 50,
      deposit: 'H2O',
      depositRichness: 1.0,
    },
  },

  pole_magnetyczne: {
    id: 'pole_magnetyczne',
    namePL: 'Silne Pole Magnetyczne',
    nameEN: 'Strong Magnetosphere',
    descriptionPL: 'Ciało niebieskie posiada niezwykle silne pole magnetyczne, chroniące przed promieniowaniem kosmicznym. Idealne warunki do kolonizacji.',
    descriptionEN: 'The celestial body has an exceptionally strong magnetic field, protecting against cosmic radiation. Ideal conditions for colonization.',
    conditions: {
      bodyType: ['planet'],
      planetType: ['rocky', 'gas', 'ocean'],
    },
    chance: 15,
    effects: {
      research: 80,
      prosperity: 5,
    },
  },

  promieniowanie_hawkinga: {
    id: 'promieniowanie_hawkinga',
    namePL: 'Promieniowanie Hawkinga',
    nameEN: 'Hawking Radiation',
    descriptionPL: 'Zaobserwowano bezpośrednie dowody promieniowania Hawkinga — emisję cząstek z mikroskopijnego horyzontu zdarzeń. Na granicy fizyki.',
    descriptionEN: 'Direct evidence of Hawking radiation has been observed — particle emission from a microscopic event horizon. At the frontier of physics.',
    conditions: {
      requiredTech: 'warp_theory',
    },
    chance: 3,
    effects: {
      research: 1000,
      milestone: true,
      milestoneId: 'physics_frontier',
    },
  },
};

// Tablica dla łatwej iteracji
export const DISCOVERY_LIST = Object.values(DISCOVERIES);
