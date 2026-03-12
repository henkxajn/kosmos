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

    // Promień powierzchniowy (R⊕) i grawitacja powierzchniowa (g)
    this.surfaceRadius  = config.surfaceRadius  ?? null;
    this.surfaceGravity = config.surfaceGravity ?? null;

    // Skład chemiczny, temperatura, atmosfera (Etap 31)
    this.composition  = config.composition  || null;
    this.temperatureK = config.temperatureK || null;
    this.temperatureC = config.temperatureC ?? (this.temperatureK != null ? this.temperatureK - 273.15 : null);
    this.atmosphere   = config.atmosphere   || 'none';

    // Pola powierzchniowe (kompatybilność z PlanetMapGenerator / RegionSystem)
    this.surface = {
      temperature:   this.temperatureC ?? (this.temperatureK ? this.temperatureK - 273 : -50), // °C
      hasWater:      this.moonType === 'icy',
      magneticField: 0,
    };

    this.lifeScore = 0;
  }

  getDisplayInfo() {
    const typeLabel = this.moonType === 'icy' ? 'Lodowy' : 'Skalny';
    const periodDays = (this.orbital.T * 365.25).toFixed(1);
    const info = {
      ...super.getDisplayInfo(),
      'Typ':              `Księżyc (${typeLabel})`,
      'Orbita (od planety)': this.orbital.a.toFixed(4) + ' AU',
      'Mimośród':         this.orbital.e.toFixed(3),
      'Okres':            `${periodDays} dni`,
    };
    const tempC = this.temperatureC ?? (this.temperatureK ? this.temperatureK - 273.15 : null);
    if (tempC != null) info['Temperatura'] = `${Math.round(tempC)}°C`;
    if (this.surfaceGravity != null) info['Grawitacja'] = `${this.surfaceGravity.toFixed(3)} g`;
    if (this.atmosphere && this.atmosphere !== 'none') info['Atmosfera'] = this.atmosphere;
    return info;
  }
}
