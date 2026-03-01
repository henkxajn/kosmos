// Kometa — lodowe ciało na wysoce eliptycznej orbicie
// Masa: 0.00001–0.001 M⊕, orbita: a=8–30 AU, e=0.75–0.97
// Widoczny ogon (hasTail) gdy perhelium q < 2.5 AU

import { CelestialBody } from './CelestialBody.js';

export class Comet extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'comet',
      visualRadius: config.visualRadius || 1,
      color:        config.color        || 0xccddff,
      glowColor:    null,
    });

    // Parametry orbitalne (układ Keplera) — wysoce eliptyczne
    this.orbital = {
      a:                 config.a    || 15.0,
      e:                 config.e    || 0.85,
      T:                 config.T    || 1.0,
      M:                 config.M    || Math.random() * Math.PI * 2,
      theta:             0,
      inclinationOffset: config.inclinationOffset || 0,
    };

    // Ogon widoczny gdy perhelium q = a*(1-e) < 2.5 AU
    this.hasTail = config.hasTail !== undefined ? config.hasTail : true;

    // Skład lodowy: woda + węgiel + azot + wodór + krzem
    this.composition = config.composition || {
      H2O: 50, C: 20, N: 15, H: 10, Si: 5,
    };
  }
}
