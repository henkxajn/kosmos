// System fizyki orbitalnej — prawa Keplera + kolizje + perturbacje orbitalne
// Komunikacja: nasłuchuje 'time:tick'
// Emituje: 'physics:updated', 'body:collision', 'planet:ejected', 'orbits:stabilityChanged'

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { KeplerMath }  from '../utils/KeplerMath.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { mergeCompositions, normalizeComposition } from '../data/ElementsData.js';

// Przelicznik: 1 masa Ziemi ≈ 3×10⁻⁶ mas Słońca
const EARTH_TO_SOLAR = 3e-6;

export class PhysicsSystem {
  constructor() {
    this._perturbAccum    = 0;
    this.PERTURB_INTERVAL = 20000;  // perturbacje co 20 000 lat gry (100× rzadziej)

    EventBus.on('time:tick', ({ deltaYears }) => this.update(deltaYears));
  }

  update(deltaYears) {
    const stars   = EntityManager.getByType('star');
    const planets = EntityManager.getByType('planet');

    if (stars.length === 0) return;
    const star = stars[0];

    // Ruch kepleriański — planety
    planets.forEach(planet => {
      this.updatePlanetPosition(planet, deltaYears, star.x, star.y);
    });

    // Ruch kepleriański — księżyce (PO planetach — parent.x/y musi być aktualne)
    const moons = EntityManager.getByType('moon');
    moons.forEach(moon => {
      const parent = EntityManager.get(moon.parentPlanetId);
      if (!parent) { EntityManager.remove(moon.id); return; }
      this.updatePlanetPosition(moon, deltaYears, parent.x, parent.y);
    });

    // Ruch kepleriański — małe ciała (asteroidy, komety, planetoidy)
    const smallBodies = [
      ...EntityManager.getByType('asteroid'),
      ...EntityManager.getByType('comet'),
      ...EntityManager.getByType('planetoid'),
    ];
    smallBodies.forEach(body => {
      this.updatePlanetPosition(body, deltaYears, star.x, star.y);
    });

    // Kolizje planet-planeta (max 1 na klatkę)
    this.checkCollisions(planets, star);

    // Kolizje małych ciał z planetami (max 1 na klatkę)
    this.checkSmallBodyCollisions(planets, smallBodies, star);

    // Perturbacje co 200 lat gry
    this._perturbAccum += deltaYears;
    if (this._perturbAccum >= this.PERTURB_INTERVAL) {
      this._perturbAccum = 0;
      this.applyPerturbations(planets, star);
    }

    EventBus.emit('physics:updated', { planets, star, moons });
  }

  // Pozycja planety wg prawa Keplera (5 kroków)
  // POPRAWKA: promień r zależy od prawdziwej anomalii theta,
  //           kierunek wektora = theta + inclinationOffset (obrót orbity w przestrzeni)
  //           Poprzedni kod: getPosition(a, e, theta + omega) obliczał r z cos(theta+omega)
  //           co jest błędne — powinno być cos(theta). Ta poprawka naprawia
  //           niezgodność między wizualnymi liniami orbit a pozycjami planet.
  updatePlanetPosition(planet, deltaYears, starX, starY) {
    const orb    = planet.orbital;
    orb.M        = KeplerMath.updateMeanAnomaly(orb.M, deltaYears, orb.T);
    const E      = KeplerMath.solveKepler(orb.M, orb.e);
    orb.theta    = KeplerMath.eccentricToTrueAnomaly(E, orb.e);
    const r      = KeplerMath.orbitalRadius(orb.a, orb.e, orb.theta);
    const angle  = orb.theta + orb.inclinationOffset;
    planet.x     = starX + r * Math.cos(angle) * GAME_CONFIG.AU_TO_PX;
    planet.y     = starY + r * Math.sin(angle) * GAME_CONFIG.AU_TO_PX;
  }

  // Wykryj kolizje planet — O(n²), max 1 kolizja na klatkę
  checkCollisions(planets, star) {
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const p1  = planets[i];
        const p2  = planets[j];
        const dx  = p1.x - p2.x;
        const dy  = p1.y - p2.y;
        const dist      = Math.sqrt(dx * dx + dy * dy);
        // Próg kolizji: 0.65× sumy promieni — wymaga realnego wizualnego nałożenia
        const threshold = (p1.visual.radius + p2.visual.radius) * 0.65;

        if (dist < threshold) {
          this._resolveCollision(p1, p2, star);
          return; // max 1 kolizja — zapobiegamy kaskadzie
        }
      }
    }
  }

  // Fizyczna rozdzielczość kolizji na podstawie zachowania pędu
  // Dwie ścieżki:
  //   masaRatio < 0.1  → absorpcja (mała wchłonięta przez dużą)
  //   masaRatio ≥ 0.1  → zderzenie z defleksją (obie dostają nowe orbity)
  //                       + losowe odłamki (35% szansa)
  _resolveCollision(p1, p2, star) {
    const bigger    = p1.physics.mass >= p2.physics.mass ? p1 : p2;
    const smaller   = p1.physics.mass <  p2.physics.mass ? p1 : p2;
    const massRatio = smaller.physics.mass / bigger.physics.mass;
    const M_star    = star.physics.mass;
    const AU        = GAME_CONFIG.AU_TO_PX;

    // Pozycje relative do gwiazdy (AU)
    const bx = (bigger.x  - star.x) / AU,  by = (bigger.y  - star.y) / AU;
    const sx = (smaller.x - star.x) / AU,  sy = (smaller.y - star.y) / AU;

    // Prędkości obu planet w bieżącym punkcie orbity (AU/rok)
    const bv = KeplerMath.getPlanetVelocity(
      bigger.orbital.a,  bigger.orbital.e,  bigger.orbital.theta || 0,
      bigger.orbital.inclinationOffset, M_star);
    const sv = KeplerMath.getPlanetVelocity(
      smaller.orbital.a, smaller.orbital.e, smaller.orbital.theta || 0,
      smaller.orbital.inclinationOffset, M_star);

    const totalMass = bigger.physics.mass + smaller.physics.mass;

    // Prędkość środka masy układu (zachowanie pędu)
    const cmVx = (bigger.physics.mass * bv.x + smaller.physics.mass * sv.x) / totalMass;
    const cmVy = (bigger.physics.mass * bv.y + smaller.physics.mass * sv.y) / totalMass;

    // ── Punkt zderzenia (potrzebny do efektów i debrisów)
    const colX = (bx + sx) / 2;
    const colY = (by + sy) / 2;

    if (massRatio < 0.1) {
      // ══ ABSORPCJA: mała planeta wchłonięta przez dużą ════════════
      const newOrbit = KeplerMath.stateToOrbit(bx, by, cmVx, cmVy, M_star);
      if (newOrbit && newOrbit.a < GAME_CONFIG.MAX_ORBIT_AU * 1.5) {
        bigger.orbital.a                = newOrbit.a;
        bigger.orbital.e                = newOrbit.e;
        bigger.orbital.inclinationOffset = newOrbit.omega;
        bigger.orbital.T                = newOrbit.T;
        bigger.orbital.M                = newOrbit.M;
      }
      // Skład: ważona średnia mas obu planet (cały skład małej trafia do dużej)
      if (bigger.composition && smaller.composition) {
        const bigW = bigger.physics.mass / totalMass;
        bigger.composition = normalizeComposition(
          mergeCompositions(bigger.composition, smaller.composition, bigW)
        );
        // Aktualizuj hasWater po absorpcji
        bigger.surface.hasWater = (bigger.composition.H2O || 0) >= 3;
      }
      bigger.physics.mass  = totalMass;
      bigger.visual.radius = Math.min(bigger.visual.radius + 1, 22);
      // NIE zerujemy lifeScore tutaj — LifeSystem sam to zrobi w handlerze body:collision
      // (gdybyśmy to robili przed emit, LifeSystem widzi lifeScore=0 i pomija life:updated
      //  → glow nigdy nie jest usuwany — bug naprawiony przez to usunięcie)

      EntityManager.remove(smaller.id);
      EventBus.emit('body:collision', {
        winner: bigger, loser: smaller, type: 'absorb',
        x: star.x + colX * AU, y: star.y + colY * AU,
      });

    } else {
      // ══ ZDERZENIE Z DEFLEKSJĄ: obie planety dostają nowe orbity ══

      // Prędkość względna (definiuje "kąt uderzenia")
      const relVx = sv.x - bv.x, relVy = sv.y - bv.y;
      const relSpd = Math.sqrt(relVx * relVx + relVy * relVy) || 0.001;
      const nrx = relVx / relSpd, nry = relVy / relSpd;   // kierunek uderzenia

      // Duża planeta: ruch CM + lekki odrzut w kierunku przeciwnym do uderzenia
      const recoil = 0.15 * (smaller.physics.mass / totalMass);
      const bNewVx = cmVx - nrx * relSpd * recoil;
      const bNewVy = cmVy - nry * relSpd * recoil;

      // Mała planeta: wyrzucona w przeciwnym kierunku od uderzenia
      const deflect = 0.4 + Math.random() * 0.35;
      const scatter = (Math.random() - 0.5) * relSpd * 0.3;
      const sNewVx  = cmVx + nrx * relSpd * deflect + (-nry) * scatter;
      const sNewVy  = cmVy + nry * relSpd * deflect + ( nrx) * scatter;

      // Oblicz nowe orbity z wektorów stanu
      const newOrbitBig   = KeplerMath.stateToOrbit(bx, by, bNewVx, bNewVy, M_star);
      const newOrbitSmall = KeplerMath.stateToOrbit(sx, sy, sNewVx, sNewVy, M_star);

      // Zaktualizuj dużą planetę
      if (newOrbitBig && newOrbitBig.a > 0.05 && newOrbitBig.a < GAME_CONFIG.MAX_ORBIT_AU * 2) {
        bigger.orbital.a                = newOrbitBig.a;
        bigger.orbital.e                = newOrbitBig.e;
        bigger.orbital.inclinationOffset = newOrbitBig.omega;
        bigger.orbital.T                = newOrbitBig.T;
        bigger.orbital.M                = newOrbitBig.M;
      }
      // Skład dużej planety: mix ze składem małej (większa "zanieczyszcza" mniejszą ~18% masy)
      if (bigger.composition && smaller.composition) {
        const transferFrac = 0.18 * (smaller.physics.mass / totalMass);
        const bigW = 1 - transferFrac;
        bigger.composition = normalizeComposition(
          mergeCompositions(bigger.composition, smaller.composition, bigW)
        );
        bigger.surface.hasWater = (bigger.composition.H2O || 0) >= 3;
      }
      bigger.physics.mass  = totalMass * 0.82;   // 18% masy ucieka jako odłamki
      bigger.visual.radius = Math.min(bigger.visual.radius + 1, 22);
      // Nie zerujemy lifeScore — LifeSystem obsługuje to przez body:collision event

      // Zaktualizuj małą lub wyrzuć ze zbyt ekscentryczną orbitą
      let smallerSurvives = false;
      if (newOrbitSmall
          && newOrbitSmall.a > 0.05
          && newOrbitSmall.a < GAME_CONFIG.MAX_ORBIT_AU * 2
          && newOrbitSmall.e < 0.97) {
        smaller.orbital.a                = newOrbitSmall.a;
        smaller.orbital.e                = newOrbitSmall.e;
        smaller.orbital.inclinationOffset = newOrbitSmall.omega;
        smaller.orbital.T                = newOrbitSmall.T;
        smaller.orbital.M                = newOrbitSmall.M;
        smaller.physics.mass *= 0.55;
        // Skład małej planety: traci część składu na rzecz dużej, reszta zostaje
        if (smaller.composition && bigger.composition) {
          smaller.surface.hasWater = (smaller.composition.H2O || 0) >= 3;
        }
        smaller.visual.radius = Math.max(3, smaller.visual.radius - 1);
        // Nie zerujemy lifeScore — LifeSystem obsługuje to przez body:collision event
        smallerSurvives = true;
      } else {
        EntityManager.remove(smaller.id);
      }

      // Odłamki: 35% szansa, wydmuchiwane prostopadle do kierunku uderzenia
      const debrisMass = totalMass * 0.18 * (0.4 + Math.random() * 0.6);
      if (Math.random() < 0.35 && debrisMass > 0.05) {
        const perpX    = -nry, perpY = nrx;
        const debSpd   = relSpd * (0.3 + Math.random() * 0.4);
        const side     = Math.random() < 0.5 ? 1 : -1;
        const dVx = cmVx + perpX * debSpd * side;
        const dVy = cmVy + perpY * debSpd * side;

        const debrisOrbit = KeplerMath.stateToOrbit(colX, colY, dVx, dVy, M_star);
        if (debrisOrbit
            && debrisOrbit.a > 0.05
            && debrisOrbit.a < GAME_CONFIG.MAX_ORBIT_AU
            && debrisOrbit.e < 0.90) {
          // Skład debris: 50/50 mix obu planet
          let debrisComp = null;
          if (bigger.composition && smaller.composition) {
            debrisComp = normalizeComposition(
              mergeCompositions(bigger.composition, smaller.composition, 0.5)
            );
          }
          EventBus.emit('physics:spawnDebris', {
            ...debrisOrbit,
            mass:        debrisMass,
            spawnX:      star.x + colX * AU,
            spawnY:      star.y + colY * AU,
            composition: debrisComp,
          });
        }
      }

      EventBus.emit('body:collision', {
        winner: bigger,
        loser:  smaller,
        type:   smallerSurvives ? 'redirect' : 'eject',
        x: star.x + colX * AU,
        y: star.y + colY * AU,
      });
    }
  }

  // ── Kolizje małych ciał z planetami ──────────────────────────
  // Kategorie wg massRatio = masa_małego / masa_planety:
  //   < 0.001 → MICROIMPACT: tylko transfer składu, bez efektu orbitalnego
  //   < 0.05  → MINOR:       cicha absorpcja, minimalny flash
  //   ≥ 0.05  → standardowa logika _resolveCollision
  checkSmallBodyCollisions(planets, smallBodies, star) {
    if (smallBodies.length === 0) return;

    for (const planet of planets) {
      for (const small of smallBodies) {
        const dx   = planet.x - small.x;
        const dy   = planet.y - small.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Próg wykrycia dla małych ciał
        const threshold = (planet.visual.radius + small.visual.radius) * 1.3;

        if (dist < threshold) {
          this._resolveSmallBodyCollision(planet, small, star);
          return; // max 1 kolizja na klatkę
        }
      }
    }
  }

  _resolveSmallBodyCollision(planet, small, star) {
    // Masa obu ciał w M⊕
    const massRatio = small.physics.mass / planet.physics.mass;

    // ── MICROIMPACT (< 0.1%): samo przeniesienie składu i masy ───
    if (massRatio < 0.001) {
      const totalMass = planet.physics.mass + small.physics.mass;

      // Transfer składu chemicznego
      if (planet.composition && small.composition) {
        const bigW = planet.physics.mass / totalMass;
        planet.composition = normalizeComposition(
          mergeCompositions(planet.composition, small.composition, bigW)
        );
        if (planet.surface) planet.surface.hasWater = (planet.composition.H2O || 0) >= 3;
      }
      planet.physics.mass = totalMass;

      // Tracking uderzeń (dla Etapu 7 — disk evolution)
      planet.impactCount  = (planet.impactCount  || 0) + 1;
      planet.massAccreted = (planet.massAccreted || 0) + small.physics.mass;

      EntityManager.remove(small.id);
      EventBus.emit('body:microimpact', {
        planet, mass: small.physics.mass, bodyType: small.type,
      });
      return;
    }

    // ── MINOR (0.1%–5%): cicha absorpcja, brak dramatycznych efektów ──
    if (massRatio < 0.05) {
      const totalMass = planet.physics.mass + small.physics.mass;

      if (planet.composition && small.composition) {
        const bigW = planet.physics.mass / totalMass;
        planet.composition = normalizeComposition(
          mergeCompositions(planet.composition, small.composition, bigW)
        );
        if (planet.surface) planet.surface.hasWater = (planet.composition.H2O || 0) >= 3;
      }
      planet.physics.mass  = totalMass;
      planet.impactCount   = (planet.impactCount  || 0) + 1;
      planet.massAccreted  = (planet.massAccreted || 0) + small.physics.mass;

      // 5% szansa na lekkie zaburzenie orbity
      if (Math.random() < 0.05) {
        planet.orbital.e = Math.min(
          planet.orbital.e + (Math.random() - 0.5) * 0.015,
          0.98
        );
        planet.orbital.e = Math.max(0, planet.orbital.e);
      }

      // Aktualizuj rozmiar wizualny (bardzo powoli)
      const newR = Math.round(4 + Math.min(planet.physics.mass * 1.8, 10));
      if (newR > planet.visual.radius) {
        planet.visual.radius = Math.min(newR, 22);
      }

      EntityManager.remove(small.id);
      EventBus.emit('body:collision', {
        winner: planet, loser: small, type: 'absorb',
        x: planet.x, y: planet.y,
      });
      return;
    }

    // ── MODERATE / MAJOR (≥ 5%): standardowa logika planet-planet ──
    // Traktujemy small body jak małą planetę (ma orbital, physics.mass)
    this._resolveCollision(planet, small, star);
  }

  // Perturbacje orbitalne oparte na promieniu Hilla
  // r_H = a × (M_planet_solar / (3 × M_star))^(1/3)
  applyPerturbations(planets, star) {
    let anyChange = false;

    for (let i = 0; i < planets.length; i++) {
      for (let j = 0; j < planets.length; j++) {
        if (i === j) continue;

        const A = planets[i];
        const B = planets[j];

        const bigMassSolar = Math.max(A.physics.mass, B.physics.mass) * EARTH_TO_SOLAR;
        const bigA         = A.physics.mass >= B.physics.mass ? A.orbital.a : B.orbital.a;
        const r_H          = bigA * Math.pow(bigMassSolar / (3 * star.physics.mass), 1 / 3);

        const smaller   = A.physics.mass < B.physics.mass ? A : B;
        const orbitDist = Math.abs(A.orbital.a - B.orbital.a);

        // Kryterium ściślejsze (1.5×) — tylko naprawdę bliskie pary
        if (orbitDist < r_H * 1.5) {
          smaller.orbital.e += 0.00005 + Math.random() * 0.0003;  // 10× słabiej niż poprzednio
          smaller.orbital.a += (Math.random() - 0.5) * 0.002;
          smaller.orbital.e  = Math.min(smaller.orbital.e, 0.98);
          smaller.orbital.a  = Math.max(smaller.orbital.a, GAME_CONFIG.MIN_ORBIT_AU * 0.5);
          smaller.orbitalStability = Math.max(0, 1 - smaller.orbital.e / 0.95);
          anyChange = true;

          // Ejekcja przy zbyt dużym mimośrodzie
          if (smaller.orbital.e > 0.92) {
            EntityManager.remove(smaller.id);
            EventBus.emit('planet:ejected', { planet: smaller });
            return;
          }
        }
      }
    }

    if (anyChange) {
      EventBus.emit('orbits:stabilityChanged', { planets: EntityManager.getByType('planet') });
    }
  }
}
