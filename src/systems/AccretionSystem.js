// System akrecji — wchłanianie planetezymali przez planety i konwersja skupisk
// Komunikacja: nasłuchuje 'time:tick', emituje 'disk:updated', 'accretion:absorbed', 'accretion:newPlanet'

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { KeplerMath } from '../utils/KeplerMath.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

export class AccretionSystem {
  constructor({ planetesimals, star }) {
    this.planetesimals  = planetesimals;
    this.star           = star;
    this._accumYears    = 0;
    this.CHECK_INTERVAL = 500;  // sprawdzaj akrecję co 500 lat gry

    EventBus.on('time:tick', ({ deltaYears }) => this.update(deltaYears));
  }

  update(deltaYears) {
    // Krok 1: Zaktualizuj pozycje wszystkich planetezymali (Kepler)
    this._updatePositions(deltaYears);

    this._accumYears += deltaYears;

    // Krok 2: Co 500 lat sprawdź akrecję i promocję skupisk
    if (this._accumYears >= this.CHECK_INTERVAL) {
      this._accumYears = 0;
      this._checkPlanetAccretion();
      this._checkClusterPromotion();
    }

    // Krok 3: Powiadom DiskRenderer
    EventBus.emit('disk:updated', { planetesimals: this.planetesimals });
  }

  // Przesuń planetezymale po orbitach (uproszczony Kepler)
  _updatePositions(deltaYears) {
    const sx = this.star.x;
    const sy = this.star.y;

    this.planetesimals.forEach(p => {
      const orb = p.orbital;
      orb.M     = KeplerMath.updateMeanAnomaly(orb.M, deltaYears, orb.T);
      const E   = KeplerMath.solveKepler(orb.M, orb.e);
      orb.theta = KeplerMath.eccentricToTrueAnomaly(E, orb.e);
      const pos = KeplerMath.getPosition(orb.a, orb.e, orb.theta + orb.inclinationOffset);
      p.x = sx + pos.x * GAME_CONFIG.AU_TO_PX;
      p.y = sy + pos.y * GAME_CONFIG.AU_TO_PX;
    });
  }

  // Sprawdź czy planetezymały są dość blisko planet, żeby zostać wchłoniętymi
  _checkPlanetAccretion() {
    const planets           = EntityManager.getByType('planet');
    const ACCRETION_DIST_AU = 0.12;  // strefa akrecji (AU)
    const accretionPx       = ACCRETION_DIST_AU * GAME_CONFIG.AU_TO_PX;

    const toRemove = new Set();

    planets.forEach(planet => {
      this.planetesimals.forEach(p => {
        if (toRemove.has(p.id)) return;

        const dx   = p.x - planet.x;
        const dy   = p.y - planet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < accretionPx) {
          // Wchłonięcie — planeta rośnie (przelicznik: 1 M_ziemi ≈ 3e-6 M_słonecznych)
          planet.physics.mass += p.mass * 3e-6;

          // Lekka korekta orbity (konserwacja momentu pędu — uproszczona)
          const totalMass  = planet.physics.mass + p.mass * 3e-6;
          planet.orbital.a = (planet.orbital.a * planet.physics.mass + p.orbital.a * p.mass * 3e-6)
                           / totalMass;

          // Aktualizuj rozmiar wizualny
          const newR = Math.round(4 + Math.min(planet.physics.mass / 3e-6 * 1.8, 10));
          if (newR > planet.visual.radius) planet.visual.radius = newR;

          toRemove.add(p.id);
          EventBus.emit('accretion:absorbed', { planetId: planet.id, planetesimalId: p.id });
        }
      });
    });

    if (toRemove.size > 0) {
      this.planetesimals = this.planetesimals.filter(p => !toRemove.has(p.id));
    }
  }

  // Sprawdź czy skupiska planetezymali osiągnęły masę progową → nowa planeta
  _checkClusterPromotion() {
    const PROMOTION_MASS_EARTH = 0.3;  // masy Ziemi
    const BIN_SIZE_AU          = 0.15; // rozmiar binu (AU)

    const bins = new Map();
    this.planetesimals.forEach(p => {
      const key = Math.floor(p.orbital.a / BIN_SIZE_AU);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(p);
    });

    bins.forEach(cluster => {
      const totalMass = cluster.reduce((sum, p) => sum + p.mass, 0);
      if (totalMass >= PROMOTION_MASS_EARTH) {
        this._promoteCluster(cluster, totalMass);
      }
    });
  }

  // Konwertuj skupisko na nową planetę
  _promoteCluster(cluster, totalMass) {
    const clusterIds = new Set(cluster.map(p => p.id));
    this.planetesimals = this.planetesimals.filter(p => !clusterIds.has(p.id));

    const avgA = cluster.reduce((s, p) => s + p.orbital.a, 0) / cluster.length;
    const avgE = cluster.reduce((s, p) => s + p.orbital.e, 0) / cluster.length;

    EventBus.emit('accretion:newPlanet', {
      a:    avgA,
      e:    Math.min(avgE, 0.5),  // ogranicz mimośród nowo narodzonych planet
      mass: totalMass,
    });
  }
}
