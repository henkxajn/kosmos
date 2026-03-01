// Planetezymał — lekki obiekt protoplanetarnego dysku
// NIE jest pełną encją — nie trafia do EntityManager
// Przechowywany w tablicy przez AccretionSystem i DiskRenderer

export class Planetesimal {
  constructor(config) {
    this.id   = config.id;     // prosty numer (nie entity_N)
    this.mass = config.mass;   // masa w masach Ziemi (0.001 – 0.05)

    // Parametry orbitalne (Kepler)
    this.orbital = {
      a:                 config.a,
      e:                 config.e,
      T:                 config.T,
      M:                 config.M,
      theta:             0,
      inclinationOffset: config.inclinationOffset || 0,
    };

    // Pozycja na ekranie (piksele) — aktualizowana przez AccretionSystem
    this.x = 0;
    this.y = 0;
  }
}
