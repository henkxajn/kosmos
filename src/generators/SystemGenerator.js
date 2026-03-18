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
import { getCompositionTemplate, normalizeComposition, getPlanetoidComposition, getMoonComposition } from '../data/ElementsData.js';
import { DepositSystem } from '../systems/DepositSystem.js';

// Bonus cieplarniany wg typu atmosfery (°C)
// thick zachowany dla backward compat (stare save'y)
const GREENHOUSE = { none: 0, thin: 15, breathable: 20, dense: 60, thick: 35 };

// Minimalna pół-separacja orbitalna per typ planety (AU)
// Suma half-sep dwóch sąsiadów = min odległość między ich orbitami
// Oparte na kryterium stabilności Hilla — gas giganty mają największe sfery Hilla
// gas: m≈50–330 M⊕ → R_Hill ≈ 0.3–0.7 AU, ×3.5 ≈ 1.0–2.5 AU
// ice: m≈2–20 M⊕  → R_Hill ≈ 0.05–0.2 AU
// rocky: m≈0.3–6 M⊕ → R_Hill ≈ 0.01–0.05 AU
const MIN_ORBIT_HALF_SEP = {
  gas:       1.2,   // AU — Jowisz/Saturn: duża masa, dominujące sfery Hilla
  ice:       0.7,   // AU — Uran/Neptun: umiarkowane masy, lodowe olbrzymy
  rocky:     0.25,  // AU — Ziemia/Wenus: małe masy (Wenus–Ziemia ≈ 0.28 AU)
  hot_rocky: 0.20,  // AU — bliskie gwiazdy, bardzo małe masy
};

// Mulberry32 PRNG — deterministyczny generator liczb pseudolosowych
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash string → number
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

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

    // Generuj złoża surowców z composition (Etap 26)
    this._generateDepositsForAll(planets, moons, planetoids, asteroids);

    return { star, planets, moons, planetesimals, asteroids, comets, planetoids };
  }

  // ── Generacja złóż surowców z composition ─────────────────────────────────
  _generateDepositsForAll(planets, moons, planetoids, asteroids) {
    const depSys = new DepositSystem();
    depSys.resetNeutroniumCount();

    // Planety — główne źródła
    for (const p of planets) depSys.generateDeposits(p);
    // Księżyce
    for (const m of moons) depSys.generateDeposits(m);
    // Planetoidy — bogate w rzadkie surowce
    for (const p of planetoids) depSys.generateDeposits(p);
    // Asteroidy
    for (const a of asteroids) depSys.generateDeposits(a);
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

  // Losuj liczbę planet wg rozkładu — pik na 8–11 (realistyczne systemy wieloplanetarne)
  // Kubełki: 5-6=3%, 7=10%, 8=22%, 9=27%, 10=23%, 11=15%
  _rollPlanetCount() {
    if (this._powerTest) return 11;  // POWER TEST — zawsze 11 planet
    const r = Math.random() * 100;
    if (r < 3)  return 5 + Math.floor(Math.random() * 2);   // 5 lub 6
    if (r < 13) return 7;                                     // 7
    if (r < 35) return 8;                                     // 8
    if (r < 62) return 9;                                     // 9
    if (r < 85) return 10;                                    // 10
    return       11;                                           // 11
  }

  // Wygeneruj 5–11 protoplanet z rozkładem Titiusa-Bode'a (baza 1.5)
  // a_n = 0.4 + 0.3 × 1.5^n (AU), skalowane do HZ gwiazdy, z perturbacją ±15%
  // Baza 1.5 (zamiast 2.0) daje gęstsze orbity → 12 slotów w 35 AU (zamiast 7 w 25 AU)
  // Gwarantuje przynajmniej jedną planetę w strefie HZ (wymagane dla emergencji życia)
  generateProtoPlanets(star) {
    const count = this._rollPlanetCount();
    const hz    = star.habitableZone;
    const planets = [];

    // Skalowanie Titius-Bode: n=2 wypada na środku HZ gwiazdy
    // Bazowy TB: a_2 = 0.4 + 0.3 × 1.5^2 = 1.075 → skaluj do hzMid
    const TB_BASE  = 1.5;                                      // baza wykładnicza (gęstsza niż klasyczne 2.0)
    const hzMid    = (hz.min + hz.max) / 2;
    const tbBase_2 = 0.4 + 0.3 * Math.pow(TB_BASE, 2);        // = 1.075
    const hzScale  = hzMid / tbBase_2;                          // skaluj cały wzorzec do HZ gwiazdy

    // Licznik breathable atmosfer w układzie (max 2)
    const breathableCount = { value: 0 };

    for (let i = 0; i < count; i++) {
      // Titius-Bode z perturbacją ±15%
      const tbRaw   = (0.4 + 0.3 * Math.pow(TB_BASE, i)) * hzScale;
      const perturb = 0.85 + Math.random() * 0.30;  // 0.85–1.15
      const a       = tbRaw * perturb;

      // Min orbit skalowane masą gwiazdy — cięższe gwiazdy mają większy promień wizualny
      // M(0.3)→0.30, K(0.7)→0.37, G(1.0)→0.45, F(1.4)→0.55 AU
      const minOrbitAU = Math.max(0.30, 0.15 + (star.mass ?? 1.0) * 0.3);
      if (a < minOrbitAU) continue;
      if (a > GAME_CONFIG.MAX_ORBIT_AU) break;

      planets.push(this._makePlanet(star, a, i, null, breathableCount));
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
      const hzP = this._makePlanet(star, hzA, planets.length, 'rocky', breathableCount);
      const insertAt = planets.findIndex(p => p.orbital.a > hzA);
      if (insertAt === -1) planets.push(hzP);
      else planets.splice(insertAt, 0, hzP);
    }

    // ── Gwarancja ≥3 gazowych/lodowych olbrzymów ──────────────────────
    // Realistyczne układy mają 3–4+ olbrzymy za linią mrozu (Jowisz/Saturn/Uran/Neptun)
    const frostLine = hz.max * 2.2;
    const MIN_GAS_ICE = 3;
    const gasIceCount = planets.filter(p => p.planetType === 'gas' || p.planetType === 'ice').length;
    if (gasIceCount < MIN_GAS_ICE) {
      const toAdd = MIN_GAS_ICE - gasIceCount;
      for (let oi = 0; oi < toAdd; oi++) {
        // Rozmieść za linią mrozu z rosnącymi odległościami
        const outerA = frostLine * (1.3 + (oi + 1) * 0.8 + Math.random() * 1.5);
        if (outerA > GAME_CONFIG.MAX_ORBIT_AU) continue;
        const outerType = Math.random() < 0.60 ? 'gas' : 'ice'; // 60% gas, 40% ice
        const outerP = this._makePlanet(star, outerA, planets.length + oi, outerType, breathableCount);
        planets.push(outerP);
      }
      // Posortuj po półosi
      planets.sort((a, b) => a.orbital.a - b.orbital.a);
    }

    // ── Wymuszenie minimalnej separacji orbit (kryterium stabilności Hilla) ──
    this._enforceMinSeparation(planets, star);

    return planets;
  }

  // Pomocnik: stwórz planetę na podanej orbicie (unika duplikacji kodu)
  // forceType — opcjonalne nadpisanie typu (np. 'rocky' dla gwarancji HZ)
  // breathableCount — ref object { value: N } limitujący breathable atmosphere w układzie
  _makePlanet(star, a, nameIndex, forceType = null, breathableCount = { value: 0 }) {
    // Niski mimośród jak w realnym układzie słonecznym (Ziemia=0.017, Jowisz=0.049)
    // POWER TEST: bardziej kołowe orbity → mniej przecięć → mniej kolizji
    const e          = this._powerTest
      ? 0.005 + Math.random() * 0.02
      : 0.01 + Math.random() * 0.08;
    const T          = KeplerMath.orbitalPeriod(a, star.physics.mass);
    const planetType = forceType || this.getPlanetType(a, star);
    const mass       = this.getPlanetMass(planetType, a, star);
    const typeConfig = PLANET_TYPE_CONFIG[planetType];
    const albedo     = typeConfig.albedo;

    // Nowy pipeline: mass → R → g → T_base_C → atmosphere → temperatureC
    const surfaceRadius  = this.calcSurfaceRadius(mass, planetType);
    const surfaceGravity = this.calcSurfaceGravity(mass, surfaceRadius);
    const T_rad_K        = this.calcEquilibriumTemp(star.luminosity, a, albedo);
    const T_base_C       = T_rad_K - 273.15;
    const atmosphere     = this.getAtmosphere(planetType, surfaceGravity, T_base_C, mass, breathableCount);
    const temperatureC   = T_base_C + (GREENHOUSE[atmosphere] ?? 0);
    const temperatureK   = temperatureC + 273.15;
    const breathableAtmosphere = atmosphere === 'breathable';

    const color = this.getPlanetColor(planetType, temperatureK, nameIndex);

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
      surfaceRadius,
      surfaceGravity,
      temperatureK,
      temperatureC,
      albedo,
      atmosphere,
      breathableAtmosphere,
      color,
      glowColor:         typeConfig.glowColor || null,
      visualRadius:      this.getVisualRadius(mass, planetType),
      composition:       normComp,
    });
  }

  // ── Wymuszenie minimalnej separacji orbit ────────────────────────────
  // Iteruje po posortowanych planetach i przesuwa za bliskie orbity na zewnątrz.
  // Separacja = suma pół-separacji dwóch sąsiadów (zależna od typu planety).
  // Planety wypchnięte poza MAX_ORBIT_AU zostają usunięte.
  _enforceMinSeparation(planets, star) {
    if (planets.length < 2) return;

    // Upewnij się, że posortowane po półosi
    planets.sort((a, b) => a.orbital.a - b.orbital.a);

    for (let i = 1; i < planets.length; i++) {
      const prev = planets[i - 1];
      const curr = planets[i];
      const minSep = (MIN_ORBIT_HALF_SEP[prev.planetType] || 0.25)
                   + (MIN_ORBIT_HALF_SEP[curr.planetType] || 0.25);

      const actualSep = curr.orbital.a - prev.orbital.a;
      if (actualSep < minSep) {
        const newA = prev.orbital.a + minSep;
        if (newA > GAME_CONFIG.MAX_ORBIT_AU) {
          // Za daleko — usuń planetę
          planets.splice(i, 1);
          i--;
          continue;
        }
        this._adjustOrbit(curr, newA, star);
      }
    }
  }

  // Przesuń orbitę planety na nową półoś i przelicz zależne parametry
  // (okres orbitalny, temperatura równowagowa z greenhouse)
  _adjustOrbit(planet, newA, star) {
    planet.orbital.a = newA;
    planet.orbital.T = KeplerMath.orbitalPeriod(newA, star.physics.mass);

    // Przelicz temperaturę: T_rad → T_base_C → + greenhouse → T_C / T_K
    const albedo     = planet.albedo ?? (PLANET_TYPE_CONFIG[planet.planetType]?.albedo ?? 0.3);
    const T_rad_K    = this.calcEquilibriumTemp(star.luminosity, newA, albedo);
    const greenhouse = GREENHOUSE[planet.atmosphere] ?? 0;
    const T_base_C   = T_rad_K - 273.15;
    planet.temperatureC = T_base_C + greenhouse;
    planet.temperatureK = planet.temperatureC + 273.15;
    if (planet.surface) {
      planet.surface.temperature = planet.temperatureC;
    }
  }

  // Oblicz temperaturę równowagową planety (Kelwiny)
  // L = lumineszencja gwiazdy (L_słoneczne), a = półoś (AU), albedo = odbicie
  calcEquilibriumTemp(L, a, albedo) {
    return 278 * Math.pow(1 - albedo, 0.25) * Math.pow(L, 0.25) / Math.sqrt(a);
  }

  // Promień powierzchniowy w R⊕ (zależy od masy i typu planety)
  calcSurfaceRadius(mass, planetType) {
    const jitter = 0.9 + Math.random() * 0.2;  // ±10% rozrzut
    if (planetType === 'gas')  return 3.5 * Math.pow(mass, 0.12) * jitter;
    if (planetType === 'ice')  return Math.pow(mass, 0.24) * jitter;
    return Math.pow(mass, 0.27) * jitter;  // rocky / hot_rocky
  }

  // Grawitacja powierzchniowa w g (ziemskich) — g = M / R²
  calcSurfaceGravity(mass, surfaceRadius) {
    return mass / (surfaceRadius * surfaceRadius);
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

  // Typ atmosfery na podstawie grawitacji, temperatury bazowej (°C) i masy
  // Retencja atmosfery zależy od grawitacji powierzchniowej (nie samej masy)
  // breathableCount = { value: N } — ref object, max 2 breathable per układ
  getAtmosphere(planetType, gravity, T_base_C, mass, breathableCount = { value: 0 }) {
    if (planetType === 'gas') return 'none';
    if (gravity < 0.15) return 'none';

    const r = Math.random();

    // Breathable: rocky + g≥0.5 + mass≥0.5 + T∈[-30,+50] + limit 2 per układ
    if (planetType === 'rocky' && gravity >= 0.5 && mass >= 0.5 &&
        T_base_C >= -30 && T_base_C <= 50 && r < 0.30 && breathableCount.value < 2) {
      breathableCount.value++;
      return 'breathable';
    }

    // Dense: duża grawitacja + duża masa
    if (gravity >= 0.80 && mass >= 2.0 && r < 0.30) return 'dense';
    if (gravity >= 0.50 && r < 0.15) return 'dense';

    // Thin: umiarkowana grawitacja
    if (gravity >= 0.50) return r < 0.80 ? 'thin' : 'none';
    if (gravity >= 0.30) return r < 0.70 ? 'thin' : 'none';
    if (gravity >= 0.15) return Math.random() < gravity * 3 ? 'thin' : 'none';

    return 'none';
  }

  // Atmosfera księżyca — zależy od grawitacji, temperatury bazowej i masy
  getAtmosphereMoon(gravity, T_base_C, mass) {
    if (gravity < 0.05) return 'none';

    const r = Math.random();

    // Duże księżyce w niskich temperaturach (Tytan-like)
    if (mass > 0.012 && T_base_C < -100) return r < 0.15 ? 'thin' : 'none';
    // Umiarkowana grawitacja + zimno
    if (gravity >= 0.10 && T_base_C < -50)  return r < 0.10 ? 'thin' : 'none';

    return 'none';
  }

  // Typ planety na podstawie odległości od gwiazdy — model 5 stref
  // Realistyczna dystrybucja: rocky blisko, gas/ice za linią mrozu
  // Za frostLine niemal brak planet skalistych (jak w Układzie Słonecznym)
  getPlanetType(a, star) {
    const hz        = star.habitableZone;
    const frostLine = hz.max * 2.2;
    const r         = Math.random();

    // 1. Gorąca strefa (< 0.5 × HZ): gorące skaliste, rzadkie hot Jowisze (~5%)
    if (a < hz.min * 0.5)    return r < 0.05 ? 'gas' : (r < 0.85 ? 'hot_rocky' : 'rocky');
    // 2. Ciepła strefa (0.5–0.85 × HZ): skaliste, rzadko gorące
    if (a < hz.min * 0.85)   return r < 0.10 ? 'hot_rocky' : 'rocky';
    // 3. Habitowalna strefa (0.85–1.3 × HZ): 100% rocky (gwarancja)
    if (a <= hz.max * 1.3)   return 'rocky';
    // 4. Strefa przejściowa (1.3×HZ – frost_line): Mars-like, ale dopuszcza wczesne olbrzymy
    if (a < frostLine)       return r < 0.20 ? 'gas' : (r < 0.45 ? 'ice' : 'rocky');
    // 5. Zimna strefa (> frost_line) — 3 pod-strefy, dominacja gas/ice (brak rocky w kosmosie)
    if (a < frostLine * 3)   return r < 0.60 ? 'gas' : (r < 0.95 ? 'ice' : 'rocky'); // Jowisz/Saturn
    if (a < frostLine * 6)   return r < 0.30 ? 'gas' : (r < 0.95 ? 'ice' : 'rocky'); // Uran/Neptun
    return r < 0.10 ? 'gas' : (r < 0.95 ? 'ice' : 'rocky');   // bardzo daleko: lodowe olbrzymy
  }

  // Masa planety (masy Ziemi) — zależy od typu i odległości (a) od gwiazdy
  // Gas bliski (Jowisz/Saturn): 50–330 M⊕, gas daleki (Neptun/Uran): 10–50 M⊕
  getPlanetMass(type, a, star) {
    switch (type) {
      case 'gas': {
        // Frost line: gazy blisko → duże (Jowisz), daleko → małe (Neptun)
        const frostLine = star ? star.habitableZone.max * 2.2 : 4.0;
        if (a && a > frostLine * 3) return 10 + Math.random() * 40;   // 10–50 M⊕ (Neptun/Uran)
        return 50 + Math.random() * 280;                               // 50–330 M⊕ (Jowisz/Saturn)
      }
      case 'ice':       return 2   + Math.random() * 18;   // 2–20 M⊕
      case 'hot_rocky': return 0.1 + Math.random() * 1.9;  // 0.1–2.0 M⊕
      default:          return 0.3 + Math.random() * 5.7;  // rocky: 0.3–6.0 M⊕
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

  // ── Planetoidy (luki między planetami, 3 typy: metallic/carbonaceous/silicate) ──
  // Bogate w rzadkie surowce (Cu, Ti, W, Pt, Li) — motywacja do ekspedycji.
  // Generowane w lukach między planetami — margines zależny od typu sąsiada
  // (gas giganty czyszczą szerszą strefę niż skaliste planety).
  _generatePlanetoids(star, planets) {
    const count = this._powerTest ? 40 : 15 + Math.floor(Math.random() * 26);  // POWER TEST: 40, normalnie 15–40
    const planetoids = [];

    // Margines bezpieczeństwa od planety — planetoidy nie orbitują w sferze Hilla
    const PLANET_MARGIN = {
      gas:       0.8,   // AU — gas giganty czyszczą szeroką strefę
      ice:       0.5,   // AU — lodowe olbrzymy
      rocky:     0.3,   // AU — skaliste planety
      hot_rocky: 0.2,   // AU — małe gorące skaliste
    };

    // Zakres planetoidów: od 2.5 AU (za strefą wewnętrzną) do MAX_ORBIT_AU
    const PLANETOID_MIN_AU = 2.5;
    const PLANETOID_MAX_AU = Math.min(GAME_CONFIG.MAX_ORBIT_AU, 25); // max 25 AU

    // Zbuduj listę zabronionych stref (planeta ± margines)
    const forbidden = planets.map(p => ({
      center: p.orbital.a,
      margin: PLANET_MARGIN[p.planetType] || 0.3,
    }));

    // Palety kolorów per typ planetoidy
    const TYPE_COLORS = {
      metallic:     [0xccbbaa, 0xbbaa99, 0xddccbb],  // jasne, metaliczne
      carbonaceous: [0x665544, 0x554433, 0x776655],  // ciemne, węgliste
      silicate:     [0x998877, 0x887766, 0xaa9988],  // szare, krzemianowe
    };

    for (let i = 0; i < count; i++) {
      let a, attempts = 0;
      do {
        a = PLANETOID_MIN_AU + Math.random() * (PLANETOID_MAX_AU - PLANETOID_MIN_AU);
        attempts++;
      } while (
        attempts < 30 &&
        forbidden.some(f => Math.abs(f.center - a) < f.margin)
      );

      const e            = 0.05 + Math.random() * 0.20;
      const T            = KeplerMath.orbitalPeriod(a, star.physics.mass);
      const mass         = 0.005 + Math.random() * 0.075;  // 0.005–0.08 M⊕
      const visualRadius = mass > 0.05 ? 5 : mass > 0.02 ? 4 : 3;

      // Losowy typ: metallic 30%, carbonaceous 40%, silicate 30%
      const r = Math.random();
      const planetoidType = r < 0.30 ? 'metallic' : r < 0.70 ? 'carbonaceous' : 'silicate';

      // Temperatura i grawitacja powierzchniowa
      const pAlbedo = { metallic: 0.15, carbonaceous: 0.05, silicate: 0.12 }[planetoidType];
      const T_rad_K        = this.calcEquilibriumTemp(star.luminosity, a, pAlbedo);
      const surfaceRadius  = this.calcSurfaceRadius(mass, 'rocky');
      const surfaceGravity = this.calcSurfaceGravity(mass, surfaceRadius);
      const temperatureK   = T_rad_K;          // brak atmosfery
      const temperatureC   = T_rad_K - 273.15;

      // Skład chemiczny wg typu + jitter ±20%
      const baseComp = getPlanetoidComposition(planetoidType);
      const composition = {};
      for (const [el, pct] of Object.entries(baseComp)) {
        const jitter    = 0.8 + Math.random() * 0.4;  // 80–120%
        composition[el] = Math.max(0, pct * jitter);
      }
      const normComp = normalizeComposition(composition);

      // Kolor wg typu
      const colors = TYPE_COLORS[planetoidType];
      const color  = colors[Math.floor(Math.random() * colors.length)];

      planetoids.push(new Planetoid({
        id:                EntityManager.generateId(),
        name:              `Plt-${i}`,
        a, e, T,
        M:                 Math.random() * Math.PI * 2,
        inclinationOffset: Math.random() * Math.PI * 2,
        mass,
        visualRadius,
        color,
        planetoidType,
        surfaceRadius,
        surfaceGravity,
        temperatureK,
        temperatureC,
        composition:       normComp,
      }));
    }
    return planetoids;
  }

  // ── Scenariusz CYWILIZACJA ───────────────────────────────────────────────────
  // Losowy układ planetarny z gwarancją 1 planety z cywilizacją.
  // Wybiera najlepszą planetę rocky w HZ i ustawia lifeScore=100.
  // DiskPhaseSystem = MATURE od startu (stabilny układ, bez perturbacji/kolizji).
  // Zwraca standardowy wynik + civPlanetId (id planety z cywilizacją).
  generateCivScenario() {
    const result = this.generate();
    const { star, planets } = result;
    const hz = star.habitableZone;

    // Znajdź najlepszą planetę rocky w HZ (scoring: temp 0–50°C, atmosfera, stabilność)
    let bestPlanet = null;
    let bestScore  = -Infinity;
    for (const p of planets) {
      if (p.planetType !== 'rocky') continue;
      let score = 0;
      // Bonus: w strefie HZ
      if (p.orbital.a >= hz.min && p.orbital.a <= hz.max) score += 50;
      // Bonus: temperatura 0–50°C
      const TC = p.temperatureC ?? (p.temperatureK ? p.temperatureK - 273.15 : -999);
      if (TC >= 0 && TC <= 50) score += 30;
      else if (TC >= -23 && TC <= 77) score += 15;
      // Bonus: atmosfera
      if (p.atmosphere === 'breathable') score += 20;
      if (p.atmosphere === 'thin') score += 10;
      if (p.atmosphere === 'dense') score += 5;
      // Bonus: stabilność orbitalna
      score += (p.orbitalStability ?? 0.5) * 10;
      if (score > bestScore) { bestScore = score; bestPlanet = p; }
    }

    // Fallback: pierwsza rocky, albo pierwsza planeta
    if (!bestPlanet) bestPlanet = planets.find(p => p.planetType === 'rocky') || planets[0];

    // Ustaw cywilizację na wybranej planecie
    bestPlanet.lifeScore        = 100;
    bestPlanet.orbitalStability = Math.max(0.9, bestPlanet.orbitalStability ?? 0.5);
    bestPlanet.surface          = bestPlanet.surface || {};
    bestPlanet.surface.hasWater = true;
    // Atmosfera breathable (nie thin) — cywilizacja wymaga oddychalnej atmosfery
    // Przelicz temperatureC: odejmij stary greenhouse, dodaj breathable
    if (bestPlanet.temperatureK != null) {
      const oldGreenhouse = GREENHOUSE[bestPlanet.atmosphere] ?? 0;
      bestPlanet.atmosphere = 'breathable';
      bestPlanet.breathableAtmosphere = true;
      const T_base_C = bestPlanet.temperatureK - 273.15 - oldGreenhouse;
      bestPlanet.temperatureC = T_base_C + GREENHOUSE.breathable;
      bestPlanet.temperatureK = bestPlanet.temperatureC + 273.15;
      bestPlanet.surface.temperature = bestPlanet.temperatureC;
    } else {
      bestPlanet.atmosphere = 'breathable';
      bestPlanet.breathableAtmosphere = true;
    }
    // Defensywne: dodaj surfaceRadius/surfaceGravity jeśli brakuje
    if (!bestPlanet.surfaceRadius) {
      bestPlanet.surfaceRadius = this.calcSurfaceRadius(bestPlanet.physics.mass, bestPlanet.planetType);
    }
    if (!bestPlanet.surfaceGravity) {
      bestPlanet.surfaceGravity = this.calcSurfaceGravity(bestPlanet.physics.mass, bestPlanet.surfaceRadius);
    }

    // Ustaw flagę globalną scenariusza (zachowaj civilization_boosted jeśli ustawiony)
    if (window.KOSMOS.scenario !== 'civilization_boosted') {
      window.KOSMOS.scenario = 'civilization';
    }

    result.civPlanetId = bestPlanet.id;
    return result;
  }

  // ── POWER TEST — scenariusz testowy z rozwiniętą cywilizacją ─────────────
  // Duży układ (11 planet, 40 planetoidów, dużo księżyców) z gwarantowaną
  // planetą cywilizacyjną w HZ. Reszta identyczna z generateCivScenario().
  // Łatwe usunięcie: szukaj "POWER TEST" w kodzie.
  generatePowerTestScenario() {
    // Wymuszamy max parametry generacji (flaga tymczasowa)
    this._powerTest = true;   // POWER TEST — flaga odczytywana w _rollPlanetCount, _generatePlanetoids, _moonCount

    const result = this.generate();

    this._powerTest = false;  // POWER TEST — reset flagi

    const { star, planets } = result;
    const hz = star.habitableZone;

    // Scoring planety cywilizacyjnej (jak w generateCivScenario)
    let bestPlanet = null;
    let bestScore  = -Infinity;
    for (const p of planets) {
      if (p.planetType !== 'rocky') continue;
      let score = 0;
      if (p.orbital.a >= hz.min && p.orbital.a <= hz.max) score += 50;
      const TC = p.temperatureC ?? (p.temperatureK ? p.temperatureK - 273.15 : -999);
      if (TC >= 0 && TC <= 50) score += 30;
      else if (TC >= -23 && TC <= 77) score += 15;
      if (p.atmosphere === 'breathable') score += 20;
      if (p.atmosphere === 'thin') score += 10;
      if (p.atmosphere === 'dense') score += 5;
      score += (p.orbitalStability ?? 0.5) * 10;
      if (score > bestScore) { bestScore = score; bestPlanet = p; }
    }
    if (!bestPlanet) bestPlanet = planets.find(p => p.planetType === 'rocky') || planets[0];

    // Ustaw cywilizację na wybranej planecie
    bestPlanet.lifeScore        = 100;
    bestPlanet.orbitalStability = Math.max(0.9, bestPlanet.orbitalStability ?? 0.5);
    bestPlanet.surface          = bestPlanet.surface || {};
    bestPlanet.surface.hasWater = true;
    if (bestPlanet.temperatureK != null) {
      const oldGreenhouse = GREENHOUSE[bestPlanet.atmosphere] ?? 0;
      bestPlanet.atmosphere = 'breathable';
      bestPlanet.breathableAtmosphere = true;
      const T_base_C = bestPlanet.temperatureK - 273.15 - oldGreenhouse;
      bestPlanet.temperatureC = T_base_C + GREENHOUSE.breathable;
      bestPlanet.temperatureK = bestPlanet.temperatureC + 273.15;
      bestPlanet.surface.temperature = bestPlanet.temperatureC;
    } else {
      bestPlanet.atmosphere = 'breathable';
      bestPlanet.breathableAtmosphere = true;
    }
    if (!bestPlanet.surfaceRadius) {
      bestPlanet.surfaceRadius = this.calcSurfaceRadius(bestPlanet.physics.mass, bestPlanet.planetType);
    }
    if (!bestPlanet.surfaceGravity) {
      bestPlanet.surfaceGravity = this.calcSurfaceGravity(bestPlanet.physics.mass, bestPlanet.surfaceRadius);
    }

    window.KOSMOS.scenario = 'power_test';  // POWER TEST

    result.civPlanetId = bestPlanet.id;
    return result;
  }

  // ── Generowanie układu dla obcej gwiazdy (mapa galaktyczna) ───────────────
  // Seeded PRNG z galaxyStar.id → deterministyczny układ.
  // Parametryzacja: typ spektralny → masa/luminosity → HZ → typy planet.
  // Encje dodawane do EntityManager (jak generate()).
  generateForStar(galaxyStar) {
    // Seeded PRNG → deterministyczna generacja
    const seed = hashString(galaxyStar.id);
    const rng  = mulberry32(seed);

    // Nadpisz Math.random tymczasowo (generate() i podsystemy używają Math.random)
    const origRandom = Math.random;
    Math.random = rng;

    try {
      // Stwórz gwiazdę z danych galaktycznych (nie losowy typ)
      const star = new Star({
        id:           EntityManager.generateId(),
        name:         galaxyStar.name,
        spectralType: galaxyStar.spectralType,
        mass:         galaxyStar.mass,
        luminosity:   galaxyStar.luminosity,
        x: 0,
        y: 0,
      });

      // Generuj planety, księżyce, itp. (metody generate*() użyją seeded rng)
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

      // Generuj złoża surowców
      this._generateDepositsForAll(planets, moons, planetoids, asteroids);

      return { star, planets, moons, planetesimals, asteroids, comets, planetoids };
    } finally {
      // Przywróć oryginalne Math.random
      Math.random = origRandom;
    }
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

    // POWER TEST — więcej księżyców (gwarantowane minimum)
    if (this._powerTest) {
      if (type === 'hot_rocky')  return 0;
      if (type === 'rocky')      return 1 + Math.floor(Math.random() * 2); // 1-2
      if (type === 'gas')        return 3 + Math.floor(Math.random() * 3); // 3-5
      if (type === 'ice')        return 2 + Math.floor(Math.random() * 2); // 2-3
      return 1;
    }

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
    const planetR3D = { gas: 0.48, ice: 0.20, rocky: 0.10, hot_rocky: 0.07 }[planet.planetType] ?? 0.10;
    const minOrbit3D = planetR3D * 2.5;                              // min: 2.5× promień planety
    // Cap dynamiczny: max 3 j. dla gas gigantów, mniejszy dla mniejszych planet
    const typeCap    = { gas: 3.0, ice: 1.5, rocky: 0.8, hot_rocky: 0.5 }[planet.planetType] ?? 1.0;
    const maxOrbit3D = Math.min(maxOrbitAU * 11, typeCap);           // max: z sąsiadów, cap per typ
    const safeMax    = Math.max(minOrbit3D + 0.15, maxOrbit3D);      // zawsze min 0.15 j. przestrzeni

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

    // Skład chemiczny wg typu księżyca + losowe wahania ±15%
    const baseComp = getMoonComposition(moonType);
    const composition = {};
    for (const [el, pct] of Object.entries(baseComp)) {
      composition[el] = Math.max(0, pct * (0.85 + Math.random() * 0.30));
    }
    const normComp = normalizeComposition(composition);

    // Temperatura równowagowa — przybliżona z orbity planety-rodzica
    const parentA = planet.orbital?.a ?? 1.0;
    const albedo  = moonType === 'icy' ? 0.6 : 0.12;
    const T_rad_K = this.calcEquilibriumTemp(star.luminosity, parentA, albedo);

    // Nowy pipeline: mass → R → g → T_base_C → atmosphere → temperatureC
    const surfaceRadius  = this.calcSurfaceRadius(mass, moonType === 'icy' ? 'ice' : 'rocky');
    const surfaceGravity = this.calcSurfaceGravity(mass, surfaceRadius);
    const T_base_C       = T_rad_K - 273.15;
    const atmosphere     = this.getAtmosphereMoon(surfaceGravity, T_base_C, mass);
    const temperatureC   = T_base_C + (GREENHOUSE[atmosphere] ?? 0);
    const temperatureK   = temperatureC + 273.15;
    // Księżyce: praktycznie zawsze false (g za małe dla breathable)
    const breathableAtmosphere = atmosphere === 'breathable';

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
      composition:       normComp,
      surfaceRadius,
      surfaceGravity,
      temperatureK,
      temperatureC,
      atmosphere,
      breathableAtmosphere,
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
