// Station — encja stacji orbitalnej (osobny typ 'station', NIE Vessel). S3.3b-S2 fundament.
// Pozycja zarządzana przez OrbitalSpaceSystem (rola 'station' → GEO, anchored, omega=0),
// nie przez komponent Keplera (orbital = null → fizyka orbitalna jej nie tyka).
// Tier 1 = baza bez modułów. fuelStore/fuelCapacity to placeholdery pod depot (S3.3b-S3).

import { CelestialBody } from './CelestialBody.js';

export class Station extends CelestialBody {
  constructor(config) {
    super({
      ...config,
      type:         'station',
      mass:         config.mass ?? 0.0001,        // znikoma — fizyka i tak nie tyka stacji
      visualRadius: config.visualRadius || 3,
      color:        config.color || 0x44aaff,
      glowColor:    null,
    });

    // Pozycja z OrbitalSpaceSystem (sferyczne r/θ/φ), nie z komponentu Keplera.
    this.orbital = null;

    this.bodyId        = config.bodyId ?? null;        // ciało wokół którego orbituje
    this.ownerEmpireId = config.ownerEmpireId ?? 'player';
    this.tier          = config.tier ?? 1;             // tier 1 = baza (bez modułów)
    this.stationType   = config.stationType ?? 'orbital_station';
    this.createdYear   = config.createdYear ?? 0;

    // Depot paliwa — placeholdery pod S3.3b-S3 (dokowanie + tankowanie). Na razie 0.
    this.fuelStore     = config.fuelStore ?? 0;
    this.fuelCapacity  = config.fuelCapacity ?? 0;

    this.systemId      = config.systemId ?? 'sys_home';
    this.explored      = true;                          // własna stacja — zawsze „znana"
  }
}
