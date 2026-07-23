// Planetoida — ciało pośrednie między asteroidą a planetą
// Masa: 0.005–0.08 M⊕, różne orbity (a=0.5–8 AU, e=0.05–0.50)
// Wizualizowana jak mała skalista planeta, ma orbitę rysowaną przez OrbitRenderer

import { CelestialBody } from './CelestialBody.js';
import { WATER_H2O_THRESHOLD } from '../data/ElementsData.js';

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

    // Atmosfera — planetoidy są BEZPOWIETRZNE. Jawne 'none' (nie undefined), aby dopłata
    // środowiskowa Stage 2 (envMultiplier: ATMOSPHERE_SURCHARGE[undefined] ?? 0 = 0 → brak kary)
    // oraz bramka klimatyczna Stage 1 (Farma: atmosphere === 'none') działały jak na ciałach
    // z atmosferą. Konstruktor uruchamia się TAKŻE przy restore (serialize planetoidy NIE zapisuje
    // atmosphere) → naprawia też już-zapisane planetoidy przy następnym loadzie, bez migracji save.
    this.atmosphere = config.atmosphere || 'none';

    // Promień powierzchniowy (R⊕) i grawitacja powierzchniowa (g)
    this.surfaceRadius  = config.surfaceRadius  ?? null;
    this.surfaceGravity = config.surfaceGravity ?? null;

    // Temperatura (K i °C)
    this.temperatureK = config.temperatureK ?? null;
    this.temperatureC = config.temperatureC ?? (this.temperatureK != null ? this.temperatureK - 273.15 : null);

    // Pola wymagane przez OrbitRenderer / StabilitySystem
    this.lifeScore        = 0;
    this.orbitalStability = 1.0;

    // Exploration gating (recon missions) — explored=zgrubny (obserwatorium/statek), analyzed=szczegółowy (statek)
    this.explored = config.explored || false;
    this.analyzed = config.analyzed || false;

    // Pola powierzchniowe (kompatybilność z PlanetMapGenerator / RegionSystem)
    this.surface = {
      hasWater:      false,
      magneticField: 0,
      temperature:   this.temperatureC ?? -100, // °C
    };

    // Skład chemiczny — generator nadpisuje wzbogaconym składem wg typu
    this.composition = config.composition || {
      Fe: 25, Si: 25, O: 28, Mg: 8, Ca: 3, Al: 3,
      H2O: 2, C: 1.5, N: 0.5, P: 0.2, H: 1, S: 0.8,
    };

    // Woda z kompozycji (Stage 2) — jednolita reguła. Planetoidy nie serializują surface,
    // więc konstruktor przelicza hasWater z composition przy każdym loadzie.
    // Zmiana zachowania: carbonaceous (~8%) / silicate (~5%) → mokre; metallic (0%) → suche.
    this.surface.hasWater = (this.composition.H2O ?? 0) >= WATER_H2O_THRESHOLD;
  }
}
