// Asteroida — małe ciało skaliste orbitujące w pasie asteroid
// Masa: 0.0001–0.005 M⊕, orbita stabilna (pas: 2.0–3.5 AU, e niskie)
// Kolizja z planetą → zawsze MICROIMPACT lub MINOR

import { CelestialBody } from './CelestialBody.js';

export class Asteroid extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'asteroid',
      visualRadius: config.visualRadius || 2,
      color:        config.color        || 0xaaaaaa,
      glowColor:    null,
    });

    // Parametry orbitalne (układ Keplera)
    this.orbital = {
      a:                 config.a    || 2.5,
      e:                 config.e    || 0.10,
      T:                 config.T    || 1.0,
      M:                 config.M    || Math.random() * Math.PI * 2,
      theta:             0,
      inclinationOffset: config.inclinationOffset || 0,
    };

    // Skład skalny: żelazo + krzem + tlen + nikiel
    this.composition = config.composition || {
      Fe: 40, Si: 35, O: 20, Ni: 5,
    };
  }
}
