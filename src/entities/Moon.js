// Księżyc — naturalny satelita planety
// Orbita wokół planety (nie gwiazdy) — parametry Keplera w AU od centrum planety
// PhysicsSystem aktualizuje pozycję po aktualizacji planety-rodzica

import { CelestialBody } from './CelestialBody.js';

export class Moon extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'moon',
      visualRadius: config.visualRadius || 2,
    });

    // Parametry orbitalne — wokół planety-rodzica, nie gwiazdy
    // a w AU (od centrum planety), T w latach
    this.orbital = {
      a:                 config.a    || 0.005,
      e:                 config.e    || 0.0,
      T:                 config.T    || 0.1,
      M:                 config.M    ?? Math.random() * Math.PI * 2,
      theta:             0,
      inclinationOffset: config.inclinationOffset || 0,
    };

    // Id planety-rodzica (używane przez PhysicsSystem)
    this.parentPlanetId = config.parentPlanetId;

    // Typ: 'rocky' | 'icy' (wpływa na kolor i skład)
    this.moonType = config.moonType || 'rocky';
  }

  getDisplayInfo() {
    const typeLabel = this.moonType === 'icy' ? 'Lodowy' : 'Skalny';
    const periodDays = (this.orbital.T * 365.25).toFixed(1);
    return {
      ...super.getDisplayInfo(),
      'Typ':              `Księżyc (${typeLabel})`,
      'Orbita (od planety)': this.orbital.a.toFixed(4) + ' AU',
      'Mimośród':         this.orbital.e.toFixed(3),
      'Okres':            `${periodDays} dni`,
    };
  }
}
