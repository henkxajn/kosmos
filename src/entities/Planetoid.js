// Planetoida — ciało pośrednie między asteroidą a planetą
// Masa: 0.005–0.08 M⊕, różne orbity (a=0.5–8 AU, e=0.05–0.50)
// Wizualizowana jak mała skalista planeta, ma orbitę rysowaną przez OrbitRenderer

import { CelestialBody } from './CelestialBody.js';

export class Planetoid extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'planetoid',
      visualRadius: config.visualRadius || 4,
      color:        config.color        || 0x998877,
      glowColor:    null,
    });

    // Parametry orbitalne (układ Keplera)
    this.orbital = {
      a:                 config.a    || 3.0,
      e:                 config.e    || 0.20,
      T:                 config.T    || 1.0,
      M:                 config.M    || Math.random() * Math.PI * 2,
      theta:             0,
      inclinationOffset: config.inclinationOffset || 0,
    };

    // Typ planetoidy (metallic / carbonaceous / silicate)
    this.planetoidType = config.planetoidType || 'silicate';

    // Pola wymagane przez OrbitRenderer / StabilitySystem
    this.lifeScore        = 0;
    this.orbitalStability = 1.0;

    // Exploration gating (recon missions)
    this.explored = config.explored || false;

    // Minimalne pola powierzchniowe (kompatybilność z _resolveCollision)
    this.surface = { hasWater: false, atmospherePressure: 0, magneticField: 0 };

    // Skład chemiczny — generator nadpisuje wzbogaconym składem wg typu
    this.composition = config.composition || {
      Fe: 25, Si: 25, O: 28, Mg: 8, Ca: 3, Al: 3,
      H2O: 2, C: 1.5, N: 0.5, P: 0.2, H: 1, S: 0.8,
    };
  }
}
