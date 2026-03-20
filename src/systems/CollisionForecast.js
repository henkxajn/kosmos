// CollisionForecast — prognoza kolizji ciał niebieskich
//
// Obserwatorium symuluje orbity w przód (KeplerMath) i wykrywa
// potencjalne kolizje. Obliczenia rozkładane na wiele klatek.
//
// Komunikacja:
//   Nasłuchuje: 'time:tick' { civDeltaYears }
//   Emituje:    'observatory:collisionAlert' { bodyA, bodyB, yearsUntil, margin }
//               'observatory:alertCleared'   { alertId }

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { KeplerMath }  from '../utils/KeplerMath.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { t }           from '../i18n/i18n.js';

// Horyzont prognozy per level obserwatorium (lata gry)
const HORIZON_BY_LEVEL = [0, 50, 100, 200, 350, 500];
// Przeliczanie co N civYears per level
const RECALC_BY_LEVEL  = [0, 10, 8, 5, 3, 2];
// Krok symulacji (lata gry)
const SIM_STEP = 0.1;
// Ile kroków obliczyć per tick (rozkład na klatki)
const STEPS_PER_TICK = 200;
// Próg kolizji: suma promieni w AU × mnożnik
const COLLISION_THRESHOLD_MULT = 0.65;
// Margines błędu prognozy (±%)
const MARGIN_PERCENT = 10;

// Typy ciał uwzględniane w prognozie
const FORECAST_TYPES = ['planet', 'moon', 'planetoid'];

export class CollisionForecast {
  constructor() {
    // Aktywne alerty: Map<alertId, { bodyA, bodyB, yearsUntil, margin, detectedYear }>
    this._alerts = new Map();

    // Stan symulacji inkrementalnej
    this._simState = null;  // { bodies, step, maxSteps, starMass }
    this._recalcAccum = 0;
    this._nextAlertId = 1;

    // Rok gry
    this._gameYear = 0;

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!window.KOSMOS?.civMode) return;
      this._tick(civDeltaYears);
    });
    EventBus.on('time:display', ({ gameTime }) => { this._gameYear = gameTime; });
  }

  // ── API publiczne ─────────────────────────────────────────────────────

  getAlerts() {
    return [...this._alerts.values()];
  }

  // Czy jest alert dotyczący planety gracza
  hasHomePlanetAlert() {
    const homeId = window.KOSMOS?.homePlanet?.id;
    if (!homeId) return false;
    for (const a of this._alerts.values()) {
      if (a.bodyAId === homeId || a.bodyBId === homeId) return true;
    }
    return false;
  }

  // ── Tick ───────────────────────────────────────────────────────────────

  _tick(civDeltaYears) {
    const obsLevel = window.KOSMOS?.observatorySystem?.getMaxObservatoryLevel() ?? 0;
    if (obsLevel <= 0) return;

    const recalcInterval = RECALC_BY_LEVEL[Math.min(obsLevel, 5)];
    this._recalcAccum += civDeltaYears;

    // Kontynuuj inkrementalną symulację jeśli trwa
    if (this._simState) {
      this._continueSimulation();
      return;
    }

    // Rozpocznij nową symulację co recalcInterval
    if (this._recalcAccum >= recalcInterval) {
      this._recalcAccum -= recalcInterval;
      this._startSimulation(obsLevel);
    }
  }

  // ── Symulacja inkrementalna ───────────────────────────────────────────

  _startSimulation(obsLevel) {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const star = EntityManager.getByTypeInSystem('star', sysId)?.[0];
    if (!star) return;

    const horizon = HORIZON_BY_LEVEL[Math.min(obsLevel, 5)];
    const maxSteps = Math.floor(horizon / SIM_STEP);

    // Zbierz ciała z bieżącymi danymi orbitalnymi (snapshot)
    const bodies = [];
    for (const type of FORECAST_TYPES) {
      for (const body of EntityManager.getByTypeInSystem(type, sysId)) {
        if (!body.orbital) continue;
        bodies.push({
          id:     body.id,
          name:   body.name ?? body.id,
          type:   body.type,
          a:      body.orbital.a,
          e:      body.orbital.e,
          T:      body.orbital.T,
          M:      body.orbital.M,     // bieżąca anomalia średnia
          omega:  body.orbital.inclinationOffset ?? 0,
          radius: (body.visual?.radius ?? 3) / GAME_CONFIG.AU_TO_PX,  // px → AU
        });
      }
    }

    if (bodies.length < 2) return;

    // Filtr: pary z potencjalnie krzyżującymi się orbitami
    // (peryhelium jednego < aphelium drugiego i odwrotnie)
    const pairs = [];
    for (let i = 0; i < bodies.length; i++) {
      const bi = bodies[i];
      const periI = bi.a * (1 - bi.e);
      const apoI  = bi.a * (1 + bi.e);
      for (let j = i + 1; j < bodies.length; j++) {
        const bj = bodies[j];
        const periJ = bj.a * (1 - bj.e);
        const apoJ  = bj.a * (1 + bj.e);
        // Orbity mogą się krzyżować?
        if (periI <= apoJ + 0.5 && periJ <= apoI + 0.5) {
          pairs.push([i, j]);
        }
      }
    }

    if (pairs.length === 0) return;

    this._simState = {
      bodies,
      pairs,
      step: 0,
      maxSteps,
      starMass: star.physics?.mass ?? 1.0,
      foundCollisions: [],
    };
  }

  _continueSimulation() {
    const s = this._simState;
    if (!s) return;

    const endStep = Math.min(s.step + STEPS_PER_TICK, s.maxSteps);

    for (let step = s.step; step < endStep; step++) {
      const dt = step * SIM_STEP;

      // Oblicz pozycje wszystkich ciał w czasie t + dt
      for (const b of s.bodies) {
        const futureM = KeplerMath.updateMeanAnomaly(b.M, dt, b.T);
        const E = KeplerMath.solveKepler(futureM, b.e);
        const theta = KeplerMath.eccentricToTrueAnomaly(E, b.e);
        const r = KeplerMath.orbitalRadius(b.a, b.e, theta);
        const angle = theta + b.omega;
        b._x = r * Math.cos(angle);  // AU
        b._y = r * Math.sin(angle);  // AU
      }

      // Sprawdź pary
      for (const [i, j] of s.pairs) {
        const bi = s.bodies[i];
        const bj = s.bodies[j];
        const dx = bi._x - bj._x;
        const dy = bi._y - bj._y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const threshold = (bi.radius + bj.radius) * COLLISION_THRESHOLD_MULT;

        if (dist < threshold) {
          // Znaleziono kolizję — dodaj jeśli nie ma już alertu dla tej pary
          const pairKey = bi.id < bj.id ? `${bi.id}_${bj.id}` : `${bj.id}_${bi.id}`;
          if (!s.foundCollisions.some(c => c.pairKey === pairKey)) {
            s.foundCollisions.push({
              pairKey,
              bodyA: bi,
              bodyB: bj,
              yearsUntil: dt,
            });
          }
        }
      }
    }

    s.step = endStep;

    // Symulacja zakończona
    if (s.step >= s.maxSteps) {
      this._finalizeSimulation();
    }
  }

  _finalizeSimulation() {
    const s = this._simState;
    if (!s) return;

    // Wyczyść stare alerty
    const oldAlertIds = new Set(this._alerts.keys());

    for (const col of s.foundCollisions) {
      // Sprawdź czy alert już istnieje dla tej pary
      let existingId = null;
      for (const [id, a] of this._alerts) {
        const aKey = a.bodyAId < a.bodyBId ? `${a.bodyAId}_${a.bodyBId}` : `${a.bodyBId}_${a.bodyAId}`;
        if (aKey === col.pairKey) { existingId = id; break; }
      }

      const margin = Math.ceil(col.yearsUntil * MARGIN_PERCENT / 100);
      const alert = {
        id:           existingId ?? this._nextAlertId++,
        bodyAId:      col.bodyA.id,
        bodyAName:    col.bodyA.name,
        bodyBId:      col.bodyB.id,
        bodyBName:    col.bodyB.name,
        yearsUntil:   col.yearsUntil,
        margin,
        detectedYear: this._gameYear,
      };

      this._alerts.set(alert.id, alert);
      if (existingId) oldAlertIds.delete(existingId);

      // Emituj alert (nowy lub zaktualizowany)
      EventBus.emit('observatory:collisionAlert', {
        bodyA:      col.bodyA,
        bodyB:      col.bodyB,
        yearsUntil: col.yearsUntil,
        margin,
        isHomePlanet: col.bodyA.id === window.KOSMOS?.homePlanet?.id ||
                      col.bodyB.id === window.KOSMOS?.homePlanet?.id,
      });
    }

    // Usuń alerty których prognoza się nie potwierdziła
    for (const id of oldAlertIds) {
      this._alerts.delete(id);
      EventBus.emit('observatory:alertCleared', { alertId: id });
    }

    this._simState = null;
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    const alerts = [];
    this._alerts.forEach(a => alerts.push({ ...a }));
    return {
      alerts,
      recalcAccum: this._recalcAccum,
      nextAlertId: this._nextAlertId,
    };
  }

  restore(data) {
    if (!data) return;
    this._recalcAccum = data.recalcAccum ?? 0;
    this._nextAlertId = data.nextAlertId ?? 1;
    if (Array.isArray(data.alerts)) {
      for (const a of data.alerts) {
        this._alerts.set(a.id, a);
      }
    }
  }
}
