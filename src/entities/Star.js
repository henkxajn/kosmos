// Gwiazda — centrum układu słonecznego
// Stoi nieruchomo w centrum ekranu (x=0, y=0 w przestrzeni gry)

import { CelestialBody } from './CelestialBody.js';
import { STAR_TYPES } from '../config/GameConfig.js';
import { ORBIT_SCALED, scaledHabitableZone } from '../utils/OrbitModel.js';
import { systemScaleOfStar } from '../utils/SystemScale.js';   // CS-PHYS-b2 (D-CS-24)

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
    // CS-PHYS-b (D-CS-19, §3.9): gwiazda świata z orbitami skalowanymi (stempel `orbitModel: 2`, zapisywany) → HZ
    // z JASNOŚCI tej gwiazdy (0.85…1.70 AU·√L). Bez stempla pole nie powstaje, HZ z tabeli klasy (każdy stary zapis).
    if (config.orbitModel === ORBIT_SCALED) {
      this.orbitModel    = ORBIT_SCALED;
      this.habitableZone = scaledHabitableZone(this.luminosity);
    }

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

  /** CS-PHYS-b2 (D-CS-24): skala odległości układu tej gwiazdy (SystemScale; bez stempla orbit 2 → 1). */
  get systemScale() { return systemScaleOfStar(this); }
}
