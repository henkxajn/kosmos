// Planeta — ciało orbitujące wokół gwiazdy
// Zawiera dane orbitalne, fizyczne, temperaturę i potencjał życia

import { CelestialBody }  from './CelestialBody.js';
import { emptyComposition } from '../data/ElementsData.js';

export class Planet extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'planet',
      visualRadius: config.visualRadius || 6,
      glowColor:    config.glowColor    || null,
    });

    // Parametry orbitalne (układ Keplera)
    this.orbital = {
      a:                 config.a    || 1.0,
      e:                 config.e    || 0.0,
      T:                 config.T    || 1.0,
      M:                 config.M    || Math.random() * Math.PI * 2,
      theta:             0,
      inclinationOffset: config.inclinationOffset || 0,
    };

    // Typ planety: 'hot_rocky' | 'rocky' | 'gas' | 'ice'
    this.planetType = config.planetType || 'rocky';

    // Temperatura równowagowa (obliczona przez SystemGenerator)
    // T_eq(K) = 278 × (1−albedo)^0.25 × L^0.25 / √a
    this.temperatureK = config.temperatureK || 0;  // Kelwiny

    // Albedo — współczynnik odbicia światła [0=czarne ciało, 1=pełne odbicie]
    this.albedo = config.albedo || 0.15;

    // Typ atmosfery: 'none' | 'thin' | 'thick' | 'dense'
    this.atmosphere = config.atmosphere || 'none';

    // Warunki powierzchniowe
    this.surface = {
      temperature:        this.temperatureK - 273,  // °C
      hasWater:           false,
      atmospherePressure: 0,    // atm
      magneticField:      0,    // 0-1
    };

    // Potencjał życia (etap 4+)
    this.lifeScore = 0;  // 0-100

    // Stabilność orbity (1.0 = stabilna, maleje przy perturbacjach)
    this.orbitalStability = 1.0;

    // Skład chemiczny planety — frakcje procentowe 20 pierwiastków (suma ≈ 100%)
    // Inicjalizowany przez SystemGenerator na podstawie typu planety i odległości od HZ
    this.composition = config.composition || emptyComposition();
  }

  getDisplayInfo() {
    const tempC   = this.surface.temperature;
    const tempStr = tempC > 0 ? `+${tempC.toFixed(0)} °C` : `${tempC.toFixed(0)} °C`;

    // Etap życia (inline, by uniknąć cyklicznego importu LifeSystem)
    const ls = this.lifeScore;
    const lifeLabel = ls <= 0  ? 'Jałowa' :
                      ls <= 20 ? 'Chemia prebiotyczna' :
                      ls <= 50 ? 'Mikroorganizmy' :
                      ls <= 80 ? 'Złożone życie' : 'Cywilizacja';

    return {
      ...super.getDisplayInfo(),
      'Orbita':      this.orbital.a.toFixed(2) + ' AU',
      'Mimośród':    this.orbital.e.toFixed(3),
      'Rok (okres)': this.orbital.T.toFixed(2) + ' lat',
      'Typ':         this.planetType,
      'Temperatura': tempStr,
      'Albedo':      this.albedo.toFixed(2),
      'Stabilność':  Math.round(this.orbitalStability * 100) + '%',
      'Życie':       ls > 0 ? `${lifeLabel} (${Math.round(ls)}%)` : 'Jałowa',
    };
  }
}
