// Gwiazda — centrum układu słonecznego
// Stoi nieruchomo w centrum ekranu (x=0, y=0 w przestrzeni gry)

import { CelestialBody } from './CelestialBody.js';
import { STAR_TYPES } from '../config/GameConfig.js';

export class Star extends CelestialBody {
  constructor(config) {
    const typeData = STAR_TYPES[config.spectralType] || STAR_TYPES.G;

    super({
      ...config,
      type:        'star',
      mass:        config.mass        || typeData.mass,
      color:       config.color       || typeData.color,
      glowColor:   typeData.glowColor,
      visualRadius: config.visualRadius || 22,
    });

    // Typ spektralny: M (czerwony), K (pomarańczowy), G (żółty), F (biały)
    this.spectralType = config.spectralType || 'G';
    this.luminosity   = config.luminosity   || typeData.luminosity;  // jasność w L☉
    this.temperature  = typeData.temperature;                         // temperatura (Kelwiny)

    // Strefa zamieszkywalna (AU) — wartości statyczne z konfiguracji
    // (balans rozgrywki: MIN_ORBIT_AU=0.3, więc skalowanie √L by wykluczyło M-type z życia)
    this.habitableZone = {
      min: typeData.habitableZone.min,
      max: typeData.habitableZone.max,
    };

    // Aktywność gwiazdy (do dalszego etapu)
    this.activity = {
      flareIntensity: 0,   // 0-1, intensywność rozbłysków słonecznych
      stability:      1.0, // 1.0 = stabilna
    };
  }

  getDisplayInfo() {
    return {
      ...super.getDisplayInfo(),
      'Typ spektralny': this.spectralType,
      'Lumineszencja':  this.luminosity.toFixed(2) + ' L☉',
      'Temperatura':    this.temperature + ' K',
      'Strefa życia':   `${this.habitableZone.min.toFixed(2)} – ${this.habitableZone.max.toFixed(2)} AU`,
    };
  }
}
