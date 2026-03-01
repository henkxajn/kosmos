// GravitySystem — semi-realistyczne N-body perturbacje grawitacyjne
//
// Podejście: hybryda Keplera + siły grawitacyjne
//   - Orbity pozostają Kepleriańskie (smooth rendering)
//   - Co GRAVITY_STEP lat gry: oblicza prawdziwe siły F = G·m₁·m₂/r²
//   - Δv = (F/m) · dt dodawane do aktualnej prędkości orbitalnej
//   - Nowe elementy orbitalne obliczane przez stateToOrbit (vis-viva + LRL)
//
// Stała grawitacji G = 4π² w jednostkach AU³/(M_sun·rok²)
// Dla planet Ziemi-masy przy 1 AU: |Δv| ≈ 0.024 AU/rok na 200 lat
//   = ~0.4% prędkości orbitalnej → efekt subtelny ale realny
//
// Komunikacja: subskrybuje 'time:tick' jak inne systemy

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { KeplerMath }  from '../utils/KeplerMath.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

// Stała grawitacji w jednostkach gry: AU³ / (M_sun · rok²)
const G_GRAV = 4 * Math.PI * Math.PI;

// Co ile lat gry przeliczamy perturbacje grawitacyjne
const GRAVITY_STEP = 3000;  // lat gry (rzadziej = mniej kumulatywnego dryftu orbit)

// Skala efektywnej masy dla perturbacji między planetami
// Wartość 1.0 = prawdziwa fizyka → za szybkie kolizje (tysiące lat)
// Wartość 0.003 → kolizje co setki tysięcy lat (skala grywalności)
const GRAVITY_MASS_SCALE = 0.003;

export class GravitySystem {
  // star: obiekt Star (masa referencyjna układu)
  constructor(star) {
    this.star        = star;
    this._accumYears = 0;

    // Subskrybuj time:tick — jak inne systemy fizyki
    EventBus.on('time:tick', ({ deltaYears }) => {
      this._accumYears += deltaYears;
      if (this._accumYears >= GRAVITY_STEP) {
        const dt = this._accumYears;
        this._accumYears = 0;
        const planets = EntityManager.getByType('planet');
        this._applyGravity(planets, this.star, dt);
      }
    });
  }

  // Przelicza grawitacyjne perturbacje między wszystkimi ciałami
  _applyGravity(bodies, star, dt) {
    if (bodies.length < 2) return;

    const AU     = GAME_CONFIG.AU_TO_PX;
    const M_star = star.physics.mass;

    for (let i = 0; i < bodies.length; i++) {
      const bi = bodies[i];
      if (!bi.orbital) continue;

      let dvx = 0, dvy = 0;

      // Pozycja planety i w AU (względem gwiazdy)
      const pix = (bi.x - star.x) / AU;
      const piy = (bi.y - star.y) / AU;

      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const bj = bodies[j];
        if (!bj.orbital) continue;

        // Pozycja planety j w AU (względem gwiazdy)
        const pjx = (bj.x - star.x) / AU;
        const pjy = (bj.y - star.y) / AU;

        // Wektor od i do j
        const dx = pjx - pix;
        const dy = pjy - piy;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1e-8) continue;   // zapobiegaj singularności przy bardzo bliskim spotkaniu

        const r = Math.sqrt(r2);

        // Pomiń planety oddalone > 5 AU (tylko bliskie sąsiedztwo ma znaczenie)
        if (r > 5) continue;

        // Masa planety j: physics.mass w M_Ziemi → M_Słońca × skala grywalności
        // GRAVITY_MASS_SCALE redukuje efektywną masę — bez tego kolizje co ~tysiąc lat
        const mj = bj.physics.mass * 3e-6 * GRAVITY_MASS_SCALE;

        // a_i = G × m_j / r² (kierunek: od i do j)
        const accel = G_GRAV * mj / r2;
        dvx += accel * (dx / r) * dt;
        dvy += accel * (dy / r) * dt;
      }

      // Pomiń jeśli zmiana prędkości nieistotna
      if (Math.abs(dvx) < 1e-12 && Math.abs(dvy) < 1e-12) continue;

      // Ogranicz maksymalny Δv per krok — ochrona przed skokami numerycznymi
      const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);
      if (dvMag > 0.05) {
        dvx *= 0.05 / dvMag;
        dvy *= 0.05 / dvMag;
      }

      // Pobierz aktualną prędkość orbitalną planety i z Keplera (AU/rok)
      const orb = bi.orbital;
      const vel = KeplerMath.getPlanetVelocity(
        orb.a, orb.e, orb.theta || 0,
        orb.inclinationOffset || 0,
        M_star
      );

      // Nowy wektor prędkości po perturbacji
      const newVx = vel.x + dvx;
      const newVy = vel.y + dvy;

      // Przelicz nowe elementy orbitalne z wektorów stanu (vis-viva + LRL)
      const newOrbit = KeplerMath.stateToOrbit(pix, piy, newVx, newVy, M_star);
      if (!newOrbit) continue;   // orbita hiperboliczna — pomiń

      // Ogranicz do sensownych granic (zapobiegaj eksplozji numerycznej)
      if (newOrbit.a < 0.01 || newOrbit.a > GAME_CONFIG.MAX_ORBIT_AU * 2.5) continue;
      if (newOrbit.e > 0.95) continue;

      // Aplikuj nowe elementy orbitalne
      bi.orbital.a                = newOrbit.a;
      bi.orbital.e                = newOrbit.e;
      bi.orbital.inclinationOffset = newOrbit.omega;
      bi.orbital.T                = newOrbit.T;
      bi.orbital.M                = newOrbit.M;

      // Przelicz stabilność orbity z nowego mimośrodu
      bi.orbitalStability = Math.max(0, 1 - bi.orbital.e / 0.95);
    }
  }
}
