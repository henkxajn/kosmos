// Proceduralny generator układu planetarnego — wczesne stadium
// Tworzy gwiazdę, 3-4 protoplanety, dysk planetezymali,
// pas asteroid, komety i planetoidy

import { Star }          from '../entities/Star.js';
import { Planet }        from '../entities/Planet.js';
import { Moon }          from '../entities/Moon.js';
import { Planetesimal }  from '../entities/Planetesimal.js';
import { Asteroid }      from '../entities/Asteroid.js';
import { Comet }         from '../entities/Comet.js';
import { Planetoid }     from '../entities/Planetoid.js';
import { KeplerMath }    from '../utils/KeplerMath.js';
import { GAME_CONFIG, STAR_TYPES, PLANET_TYPE_CONFIG } from '../config/GameConfig.js';
import EntityManager     from '../core/EntityManager.js';
import { getCompositionTemplate, normalizeComposition } from '../data/ElementsData.js';

export class SystemGenerator {

  // Wygeneruj kompletny układ: gwiazda + protoplanety + księżyce + dysk + pasy
  // Zwraca: { star, planets, moons, planetesimals, asteroids, comets, planetoids }
  generate() {
    const star          = this.generateStar();
    const planets       = this.generateProtoPlanets(star);
    const moons         = this.generateMoonsForPlanets(planets, star);
    const planetesimals = this.generateDisk(star);
    const asteroids     = this._generateAsteroidBelt(star, planets);
    const comets        = this._generateComets(star);
    const planetoids    = this._generatePlanetoids(star, planets);

    EntityManager.add(star);
    planets.forEach(p => EntityManager.add(p));
    moons.forEach(m => EntityManager.add(m));
    asteroids.forEach(a => EntityManager.add(a));
    comets.forEach(c => EntityManager.add(c));
    planetoids.forEach(p => EntityManager.add(p));
    // Planetezymale NIE trafiają do EntityManager — lightweight array

    return { star, planets, moons, planetesimals, asteroids, comets, planetoids };
  }

  // Wygeneruj gwiazdę z losowym typem spektralnym
  generateStar() {
    const spectralType  = this.randomSpectralType();
    const typeData      = STAR_TYPES[spectralType];
    const massVariation = 0.9 + Math.random() * 0.2;
    const mass          = typeData.mass * massVariation;
    const luminosity    = typeData.luminosity * Math.pow(massVariation, 4); // L ∝ M⁴

    return new Star({
      id:           EntityManager.generateId(),
      name:         this.generateStarName(),
      spectralType,
      mass,
      luminosity,
      x: 0,
      y: 0,
    });
  }

  // Wybierz losowy typ spektralny z wagami
  randomSpectralType() {
    const weighted = [];
    Object.entries(STAR_TYPES).forEach(([type, data]) => {
      for (let i = 0; i < data.weight; i++) weighted.push(type);
    });
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  // Losuj liczbę planet wg rozkładu prawdopodobieństwa opartego na statystykach egzoplanet
  // Kubełki: 1 planeta=1%, 2-3=15%, 3-4=30%, 4-6=20%, 6-9=24%, 9-11=10%
  _rollPlanetCount() {
    const r = Math.random() * 100;
    if (r < 1)  return 1;
    if (r < 16) return 2 + Math.floor(Math.random() * 2);   // 2 lub 3
    if (r < 46) return 3 + Math.floor(Math.random() * 2);   // 3 lub 4
    if (r < 66) return 4 + Math.floor(Math.random() * 3);   // 4, 5 lub 6
    if (r < 90) return 6 + Math.floor(Math.random() * 4);   // 6, 7, 8 lub 9
    return       9 + Math.floor(Math.random() * 3);          // 9, 10 lub 11
  }

  // Wygeneruj 1–11 protoplanet (liczba losowana z rozkładu)
  // Gwarantuje przynajmniej jedną planetę w strefie HZ (wymagane dla emergencji życia)
  generateProtoPlanets(star) {
    const count = this._rollPlanetCount();
    const hz    = star.habitableZone;
    const planets = [];

    // Start od połowy wewnętrznej krawędzi HZ — daje szansę dotarcia do HZ
    let currentAU = Math.max(0.04, hz.min * 0.5);

    // Rozstaw orbit: mniejszy ratio dla dużych układów (by zmieścić wiele planet w MAX_ORBIT_AU)
    const [minRatio, maxRatio, minGap] =
      count > 8 ? [1.22, 1.42, 0.10] :
      count > 5 ? [1.35, 1.62, 0.14] :
                  [1.50, 2.00, 0.20];

    for (let i = 0; i < count; i++) {
      const ratio = minRatio + Math.random() * (maxRatio - minRatio);
      const a     = Math.max(currentAU * ratio, currentAU + minGap);

      if (a > GAME_CONFIG.MAX_ORBIT_AU) break;

      planets.push(this._makePlanet(star, a, i));
      currentAU = a;
    }

    // ── Gwarancja SKALISTEJ planety w HZ ──────────────────────────────
    // Wymaga rocky (nie gas) — tylko skaliste mogą mieć życie powierzchniowe.
    // Gas w HZ nie liczy się: LifeSystem odrzuca gas/ice przez _calcPotential().
    const hasRockyHZ = planets.some(p =>
      p.orbital.a >= hz.min && p.orbital.a <= hz.max && p.planetType === 'rocky'
    );
    if (!hasRockyHZ) {
      const hzA = hz.min + Math.random() * (hz.max - hz.min);
      // forceType='rocky' — gwarancja: HZ musi mieć skalistą planetę
      const hzP = this._makePlanet(star, hzA, planets.length, 'rocky');
      const insertAt = planets.findIndex(p => p.orbital.a > hzA);
      if (insertAt === -1) planets.push(hzP);
      else planets.splice(insertAt, 0, hzP);
    }

    return planets;
  }

  // Pomocnik: stwórz planetę na podanej orbicie (unika duplikacji kodu)
  // forceType — opcjonalne nadpisanie typu (np. 'rocky' dla gwarancji HZ)
  _makePlanet(star, a, nameIndex, forceType = null) {
    // Niski mimośród jak w realnym układzie słonecznym (Ziemia=0.017, Jowisz=0.049)
    const e          = 0.01 + Math.random() * 0.08;
    const T          = KeplerMath.orbitalPeriod(a, star.physics.mass);
    const planetType = forceType || this.getPlanetType(a, star);
    const mass       = this.getPlanetMass(planetType);
    const typeConfig = PLANET_TYPE_CONFIG[planetType];
    const albedo     = typeConfig.albedo;
    const tempK      = this.calcEquilibriumTemp(star.luminosity, a, albedo);
    const color      = this.getPlanetColor(planetType, tempK, nameIndex);
    const atmosphere = this.getAtmosphere(planetType, tempK);

    // Skład chemiczny — inicjalizowany wg typu planety i odległości od HZ
    // Lekkie losowe wahania (±20% wartości bazowej) dla różnorodności układów
    const baseComp = getCompositionTemplate(planetType, a, star.habitableZone);
    const composition = {};
    for (const [el, pct] of Object.entries(baseComp)) {
      const jitter     = 0.8 + Math.random() * 0.4;  // 80–120% wartości bazowej
      composition[el]  = Math.max(0, pct * jitter);
    }
    const normComp = normalizeComposition(composition);

    return new Planet({
      id:                EntityManager.generateId(),
      name:              this.generatePlanetName(star.name, nameIndex),
      a, e, T,
      M:                 Math.random() * Math.PI * 2,
      inclinationOffset: Math.random() * Math.PI * 2,
      mass,
      planetType,
      temperatureK:      tempK,
      albedo,
      atmosphere,
      color,
      glowColor:         typeConfig.glowColor || null,
      visualRadius:      this.getVisualRadius(mass, planetType),
      composition:       normComp,
    });
  }

  // Oblicz temperaturę równowagową planety (Kelwiny)
  // L = lumineszencja gwiazdy (L_słoneczne), a = półoś (AU), albedo = odbicie
  calcEquilibriumTemp(L, a, albedo) {
    return 278 * Math.pow(1 - albedo, 0.25) * Math.pow(L, 0.25) / Math.sqrt(a);
  }

  // Kolor planety per typ (i temperatura dla rocky)
  getPlanetColor(planetType, temperatureK, index) {
    const typeConfig = PLANET_TYPE_CONFIG[planetType];

    if (planetType === 'rocky') {
      return this.getRockyColor(temperatureK);
    }

    // Losowy wariant koloru z puli per typ (nie sekwencyjny — więcej różnorodności)
    const variants = typeConfig.colorVariants;
    return variants[Math.floor(Math.random() * variants.length)];
  }

  // Kolor rocky planety zależy od temperatury — losowy z kilku wariantów per zakres
  getRockyColor(T_K) {
    const T_C = T_K - 273;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    if (T_C > 200) return pick([0x9870a0, 0x7a6090, 0xb08090, 0xa87898]);  // gorąca — fiolet/róż
    if (T_C > 60)  return pick([0xa87858, 0xb88060, 0x906850, 0xc09068]);  // ciepła — brunatna
    if (T_C > 10)  return pick([0x6898a8, 0x5888a0, 0x7098b0, 0x5878a8]);  // umiarkowana — woda
    if (T_C > -20) return pick([0x78a870, 0x68a068, 0x80b878, 0x6a9070]);  // chłodna — roślinność
    if (T_C > -60) return pick([0x7088a0, 0x6880a0, 0x7890a8, 0x607898]);  // zimna — szaro-błękit
    return           pick([0x8898b0, 0x90a0b8, 0x7888a8, 0x98a8c0]);       // lodowata
  }

  // Typ atmosfery na podstawie planety i temperatury
  getAtmosphere(planetType, T_K) {
    if (planetType === 'gas')  return 'dense';
    if (planetType === 'ice')  return 'thin';
    const T_C = T_K - 273;
    if (T_C > -60 && T_C < 400) return 'thin';
    return 'none';
  }

  // Typ planety na podstawie odległości od gwiazdy + element losowości
  // Oparty na statystykach misji Kepler: różnorodność typów nawet w tej samej strefie
  getPlanetType(a, star) {
    const hz        = star.habitableZone;
    const frostLine = hz.max * 2.2;
    const r         = Math.random();

    // Bardzo blisko gwiazdy: skaliste gorące, rzadkie gorące Jowisze (~7%)
    if (a < hz.min * 0.4)    return r < 0.07 ? 'gas' : 'hot_rocky';
    // Wewnętrzna strefa: gorące skaliste, okazjonalne bliskie gazy (~12%)
    if (a < hz.min)          return r < 0.12 ? 'gas' : 'hot_rocky';
    // Strefa HZ: głównie skaliste, rzadziej gazy (~10%)
    if (a <= hz.max)         return r < 0.10 ? 'gas' : 'rocky';
    // Post-HZ do linii mrozu: mix skalistych i gazowych (mini-Neptyny są tu częste ~28%)
    if (a < frostLine)       return r < 0.28 ? 'gas' : 'rocky';
    // Strefa gazowych olbrzymów: głównie gaz, trochę lód
    if (a < frostLine * 3.5) return r < 0.78 ? 'gas' : 'ice';
    // Zewnętrzny układ: lodowe olbrzymy z domieszką gazowych
    return r < 0.32 ? 'gas' : 'ice';
  }

  // Masa planety (masy Ziemi) — szersze zakresy dla większej różnorodności
  getPlanetMass(type) {
    switch (type) {
      case 'gas':       return 30  + Math.random() * 300;  // Jowisz–Saturn: 30–330 M⊕
      case 'ice':       return 8   + Math.random() * 60;   // Neptun–Uran: 8–68 M⊕
      case 'hot_rocky': return 0.1 + Math.random() * 3;    // Merkury–super-Ziemia: 0.1–3.1 M⊕
      default:          return 0.2 + Math.random() * 8;    // rocky — super-Ziemie możliwe: 0.2–8 M⊕
    }
  }

  // Rozmiar wizualny (px)
  getVisualRadius(mass, type) {
    if (type === 'gas') return Math.round(12 + Math.min(mass / 60, 8));
    if (type === 'ice') return Math.round(9  + Math.min(mass / 25, 5));
    return Math.round(4 + Math.min(mass * 1.8, 6));
  }

  // Wygeneruj dysk protoplanetarny z 40-60 planetezymali
  generateDisk(star) {
    const count = GAME_CONFIG.DISK_MIN_PLANETESIMALS
      + Math.floor(Math.random() * (GAME_CONFIG.DISK_MAX_PLANETESIMALS - GAME_CONFIG.DISK_MIN_PLANETESIMALS + 1));

    const planetesimals = [];

    for (let i = 0; i < count; i++) {
      // Rozkład logarytmiczny: więcej ciał w pasie wewnętrznym, mniej na zewnątrz
      const t  = Math.pow(Math.random(), 0.65);
      const a  = GAME_CONFIG.DISK_MIN_AU + t * (GAME_CONFIG.DISK_MAX_AU - GAME_CONFIG.DISK_MIN_AU);
      const e  = 0.05 + Math.random() * 0.32;   // bardziej eliptyczne niż planety
      const T  = KeplerMath.orbitalPeriod(a, star.physics.mass);
      const M  = Math.random() * Math.PI * 2;
      const mass = 0.001 + Math.random() * 0.049;  // 0.001 – 0.05 mas Ziemi

      planetesimals.push(new Planetesimal({
        id:                i,
        mass,
        a, e, T, M,
        inclinationOffset: Math.random() * Math.PI * 2,
      }));
    }

    return planetesimals;
  }

  // ── Pas asteroid (2.0–3.5 AU, stabilne orbity) ────────────────
  // Nie generowany gdy jest duża planeta (gas) w zakresie 1.5–4.0 AU
  _generateAsteroidBelt(star, planets) {
    const hasGasInBelt = planets.some(p =>
      p.orbital.a >= 1.5 && p.orbital.a <= 4.0 &&
      (p.planetType === 'gas' || p.physics.mass > 50)
    );

    const count = hasGasInBelt
      ? Math.floor(Math.random() * 8)         // mały pas: 0–7 (gazowy olbrzym go czyści)
      : 25 + Math.floor(Math.random() * 21);  // normalny pas: 25–45

    const asteroids = [];
    for (let i = 0; i < count; i++) {
      const a           = 2.8 + Math.random() * 1.7;   // 2.8–4.5 AU (dalej od strefy rocky)
      const e           = 0.03 + Math.random() * 0.12; // stabilne 0.03–0.15
      const T           = KeplerMath.orbitalPeriod(a, star.physics.mass);
      const mass        = 0.0001 + Math.random() * 0.005;
      const visualRadius = mass > 0.003 ? 3 : mass > 0.001 ? 2 : 1;

      asteroids.push(new Asteroid({
        id:                EntityManager.generateId(),
        name:              `Ast-${i}`,
        a, e, T,
        M:                 Math.random() * Math.PI * 2,
        inclinationOffset: Math.random() * Math.PI * 2,
        mass,
        visualRadius,
      }));
    }
    return asteroids;
  }

  // ── Komety (a=8–30 AU, e=0.75–0.97, wysoce eliptyczne) ────────
  _generateComets(star) {
    const count = 8 + Math.floor(Math.random() * 8);  // 8–15
    const comets = [];

    for (let i = 0; i < count; i++) {
      const a    = 8 + Math.random() * 22;            // 8–30 AU
      const e    = 0.75 + Math.random() * 0.22;       // 0.75–0.97
      const T    = KeplerMath.orbitalPeriod(a, star.physics.mass);
      const mass = 0.00001 + Math.random() * 0.001;

      // Perhelium komety (q = a*(1-e)); jeśli < 2.5 AU → ogon widoczny
      const q = a * (1 - e);

      comets.push(new Comet({
        id:                EntityManager.generateId(),
        name:              `Comet-${i}`,
        a, e, T,
        M:                 Math.random() * Math.PI * 2,
        inclinationOffset: Math.random() * Math.PI * 2,
        mass,
        visualRadius: 1,
        hasTail: q < 2.5,
      }));
    }
    return comets;
  }

  // ── Planetoidy (a=0.5–8 AU, e=0.05–0.50, różne rozmiary) ──────
  // Unikają nakładania z istniejącymi planetami (odstęp ± 0.3 AU)
  _generatePlanetoids(star, planets) {
    const count = 5 + Math.floor(Math.random() * 6);  // 5–10
    const planetoids = [];
    const occupiedAU  = planets.map(p => p.orbital.a);

    for (let i = 0; i < count; i++) {
      let a, attempts = 0;
      do {
        // Planetoidy tylko w zewnętrznym układzie — unikają strefy rocky (0.3–3 AU)
        a = 3.5 + Math.random() * 4.5;  // 3.5–8.0 AU
        attempts++;
      } while (
        attempts < 20 &&
        occupiedAU.some(pA => Math.abs(pA - a) < 0.4)
      );

      const e           = 0.05 + Math.random() * 0.20;  // max 0.25 — umiarkowane ekscentryczności
      const T           = KeplerMath.orbitalPeriod(a, star.physics.mass);
      const mass        = 0.005 + Math.random() * 0.075;  // 0.005–0.08 M⊕
      const visualRadius = mass > 0.05 ? 5 : mass > 0.02 ? 4 : 3;

      // Kolor wg strefy
      const hz  = star.habitableZone;
      let color = 0x998877;
      if (a < hz.min)        color = 0xaa7755;  // wewnętrzna — cieplejszy
      if (a > hz.max * 3.0)  color = 0x8899aa;  // zewnętrzna — lodowy odcień

      planetoids.push(new Planetoid({
        id:                EntityManager.generateId(),
        name:              `Plt-${i}`,
        a, e, T,
        M:                 Math.random() * Math.PI * 2,
        inclinationOffset: Math.random() * Math.PI * 2,
        mass,
        visualRadius,
        color,
      }));
    }
    return planetoids;
  }

  // ── Scenariusz testowy EDEN ──────────────────────────────────────────────────
  // Układ idealnie wybalansowany — jeden cel: szybkie powstanie i ewolucja życia.
  // Przeznaczony do testów rozgrywki 4X, NIE do normalnej gry.
  // Warunki: G-type star, 1 planeta w centrum HZ, lifeScore pre-seeded,
  //          brak asteroid w wewnętrznym układzie, DiskPhaseSystem = MATURE od startu.
  generateEdenScenario() {
    // Stała gwiazda Sol-like
    const star = new Star({
      id:           EntityManager.generateId(),
      name:         'Sol-Eden',
      spectralType: 'G',
      mass:         1.0,
      luminosity:   1.0,
      x:            0,
      y:            0,
    });

    // Jedna idealna planeta — środek strefy HZ dla gwiazdy G (0.95–1.4 AU → centrum ~1.17)
    const a    = 1.1;   // AU — w centrum HZ, ciepło i przyjemnie
    const e    = 0.001; // kwazikolista orbita
    const T    = KeplerMath.orbitalPeriod(a, star.physics.mass);

    // Optymalny skład chemiczny dla życia (H₂O + C + P na maksimum)
    const comp = normalizeComposition({
      H2O: 18,  // dużo wody
      C:    7,  // bogaty w węgiel
      O:   22,  // tlen
      Fe:  17,  // żelazo (rdzeń)
      Si:  15,  // krzemian
      N:    6,  // azot
      Mg:   5,  // magnez
      P:    2,  // fosfor (klucz dla życia)
      Ni:   3,  // nikiel
      S:    2,  // siarka
      Ca:   1,  // wapń
      Al:   1,  // aluminium
      K:    1,  // potas
    });

    const planet = new Planet({
      id:                EntityManager.generateId(),
      name:              'Eden',
      a, e, T,
      M:                 0,
      inclinationOffset: 0,
      mass:              1.0,   // M_Ziemi
      planetType:        'rocky',
      temperatureK:      291,   // 18°C — optimum dla życia
      albedo:            0.15,
      atmosphere:        'thin',
      color:             0x78a870,  // zielono-szary
      glowColor:         null,
      visualRadius:      7,
      composition:       comp,
    });

    // Pre-seed życia — cywilizacja już istnieje (Eden = test 4X od startu)
    planet.lifeScore          = 100;
    planet.surface.hasWater   = true;
    planet.orbitalStability   = 0.98;
    planet.massAccreted       = 0;
    planet.impactCount        = 0;

    // Kilka komet w dalekim układzie (tylko dla estetyki, nie krzyżują orbit)
    const comets = [];
    for (let i = 0; i < 5; i++) {
      const ca   = 20 + i * 3;          // 20–32 AU — daleko od wewnętrznego układu
      const ce   = 0.82 + Math.random() * 0.10;
      const cT   = KeplerMath.orbitalPeriod(ca, star.physics.mass);
      const q    = ca * (1 - ce);       // perhelium

      comets.push(new Comet({
        id:                EntityManager.generateId(),
        name:              `Eden-C${i + 1}`,
        a: ca, e: ce, T: cT,
        M:                 Math.random() * Math.PI * 2,
        inclinationOffset: Math.random() * Math.PI * 2,
        mass:              0.00005 + Math.random() * 0.0005,
        visualRadius:      1,
        hasTail:           q < 2.5,
      }));
    }

    // Oznacz globalnie — DiskPhaseSystem i GameScene korzystają z tej flagi
    window.KOSMOS.edenScenario = true;

    EntityManager.add(star);
    EntityManager.add(planet);
    comets.forEach(c => EntityManager.add(c));

    return {
      star,
      planets:       [planet],
      moons:         [],          // Eden: brak księżyców (czysty scenariusz testowy)
      planetesimals: [],
      asteroids:     [],
      comets,
      planetoids:    [],
    };
  }

  // ── Generowanie księżyców ──────────────────────────────────────
  // Liczba księżyców per planeta na podstawie masy i typu
  // Oparte na statystykach Układu Słonecznego i modelach formowania satelitów

  generateMoonsForPlanets(planets, star) {
    const allMoons = [];
    for (let i = 0; i < planets.length; i++) {
      const planet = planets[i];
      const count  = this._moonCount(planet);
      if (count === 0) continue;

      // Odległość do najbliższego sąsiada (AU) — ogranicza orbity księżyców
      const prevA    = i > 0 ? planets[i - 1].orbital.a : 0;
      const nextA    = i < planets.length - 1 ? planets[i + 1].orbital.a : planet.orbital.a * 2;
      const innerGap = planet.orbital.a - prevA;
      const outerGap = nextA - planet.orbital.a;
      const maxOrbitAU = Math.min(innerGap, outerGap) * 0.25; // max 25% dystansu do sąsiada

      for (let mi = 0; mi < count; mi++) {
        allMoons.push(this._makeMoon(planet, mi, star, maxOrbitAU, count));
      }
    }
    return allMoons;
  }

  // Ile księżyców ma ta planeta?
  _moonCount(planet) {
    const r    = Math.random();
    const mass = planet.physics.mass;
    const type = planet.planetType;

    if (type === 'hot_rocky')           return 0;          // za blisko gwiazdy
    if (type === 'rocky' && mass < 0.3) return 0;          // za mała (Merkury-like)
    if (type === 'rocky' && mass < 1.0) return r < 0.40 ? 1 : 0;  // 40% szans na 1
    if (type === 'rocky' && mass < 3.0) return r < 0.60 ? 1 : 0;  // 60% szans na 1
    if (type === 'rocky')               return r < 0.50 ? 2 : 1;   // duże skaliste: 1-2
    if (type === 'gas')   return 2 + Math.floor(Math.random() * 4); // gazowe: 2-5
    if (type === 'ice')   return 1 + Math.floor(Math.random() * 3); // lodowe: 1-3
    return 0;
  }

  // Stwórz jeden księżyc dla planety
  // Orbity skalowane do sąsiadów — nie nachodzą na orbity sąsiednich planet
  // maxOrbitAU: max orbita w AU (25% dystansu do najbliższego sąsiada)
  _makeMoon(planet, moonIndex, star, maxOrbitAU = 0.15, moonCount = 1) {
    // Przybliżony promień planety w Three.js units (spójny z ThreeRenderer._planetRadius)
    const planetR3D = { gas: 0.45, ice: 0.26, rocky: 0.14, hot_rocky: 0.10 }[planet.planetType] ?? 0.14;
    const minOrbit3D = planetR3D * 2.5;                              // min: 2.5× promień planety
    const maxOrbit3D = Math.min(maxOrbitAU * 11, 3.0);              // max: z sąsiadów, cap 3 units
    const safeMax    = Math.max(minOrbit3D + 0.2, maxOrbit3D);      // zawsze min 0.2 j. przestrzeni

    // Rozłóż księżyce równomiernie w zakresie [minOrbit3D, safeMax]
    const frac    = moonCount <= 1 ? 0.35 : (moonIndex + 0.5) / moonCount;
    const orbit3D = minOrbit3D + frac * (safeMax - minOrbit3D) + Math.random() * 0.1;
    const a       = orbit3D / 11;                                    // AU od planety

    // Okres orbitalny skalibrowany wizualnie — NIE fizykalnie poprawny Kepler.
    // KeplerMath.orbitalPeriod() dla naszej skali daje T≈7–15 lat na orbitę,
    // co przy prędkości 1d/s oznacza ≈3650 sekund/orbitę → księżyc wygląda statycznie.
    // Cel: 1 orbita = 5–35 sekund realnych przy 1d/s (0.00274 yr/s):
    //   T = 5s × 0.00274 = 0.014 lat (wew.) … T = 35s × 0.00274 = 0.096 lat (zew.)
    const T = 0.014 + moonIndex * 0.016 + Math.random() * 0.014;
    //  moonIndex=0: T ≈ 0.014–0.028 lat  (5–10  dni)  → orbita 5–10 s przy 1d/s
    //  moonIndex=4: T ≈ 0.078–0.092 lat  (28–34 dni)  → orbita 28–34 s przy 1d/s
    const e        = Math.random() * 0.08;                // quasi-kołowe
    const M        = Math.random() * Math.PI * 2;
    const mass     = 0.0001 + Math.random() * 0.015;      // M_Ziemi

    // Typ: lodowy jeśli planeta jest lodowa lub gazowa daleko od gwiazdy
    const isIcy = planet.planetType === 'ice' ||
                  (planet.planetType === 'gas' && Math.random() < 0.55);
    const moonType = isIcy ? 'icy' : 'rocky';
    const color    = moonType === 'icy' ? this._icyMoonColor() : this._rockyMoonColor();

    // Rozmiar wizualny: 1-3 (px/Three.js units, mały)
    const visualRadius = Math.max(1, Math.min(3, Math.round(mass * 200 + 0.8)));

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    return new Moon({
      id:                EntityManager.generateId(),
      name:              `${planet.name}-${romanNumerals[moonIndex] || moonIndex + 1}`,
      a, e, T, M,
      inclinationOffset: Math.random() * Math.PI * 2,
      mass,
      visualRadius,
      color,
      parentPlanetId:    planet.id,
      moonType,
    });
  }

  // Kolory księżyców
  _rockyMoonColor() {
    const colors = [0x888880, 0x999988, 0x777770, 0x888870, 0x8a8878, 0x706870, 0x989088];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  _icyMoonColor() {
    const colors = [0xd0d8e0, 0xc8d8e8, 0xd8e8f0, 0xc0ccd8, 0xdce8f0, 0xe0eaf8];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Losowa nazwa gwiazdy w stylu katalogów astronomicznych
  generateStarName() {
    const prefixes = ['HD', 'GJ', 'KOI', 'TOI', 'TRAPPIST', 'Kepler', 'LHS'];
    const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number   = Math.floor(Math.random() * 8999) + 1000;
    return `${prefix}-${number}`;
  }

  // Nazwa planety: [gwiazda] b, c, d... (konwencja katalogów egzoplanet)
  generatePlanetName(starName, index) {
    const letters = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];
    return `${starName} ${letters[index] || index + 2}`;
  }
}
