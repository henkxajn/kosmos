// System życia — emergencja i ewolucja życia na planetach skalistych
// Komunikacja: nasłuchuje 'time:tick', 'body:collision'
// Emituje: 'life:emerged', 'life:evolved', 'life:extinct', 'life:updated'

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { lifeBonus } from '../data/ElementsData.js';
import { t }         from '../i18n/i18n.js';

// Etapy ewolucji życia (lifeScore 0-100)
// Klucze i18n etapów życia — label obliczany dynamicznie przez getLabel()
export const LIFE_STAGES = [
  { min: 0,  max: 0,   key: 'life.barren',          emoji: '🪨', glowAlpha: 0     },
  { min: 1,  max: 20,  key: 'life.prebiotic',       emoji: '🧪', glowAlpha: 0.10 },
  { min: 21, max: 50,  key: 'life.microorganisms',  emoji: '🦠', glowAlpha: 0.22 },
  { min: 51, max: 80,  key: 'life.complexLife',      emoji: '🌿', glowAlpha: 0.40 },
  { min: 81, max: 100, key: 'life.civilization',     emoji: '🏙', glowAlpha: 0.60 },
];
// Getter — zwraca przetłumaczoną etykietę etapu życia
LIFE_STAGES.forEach(s => {
  Object.defineProperty(s, 'label', { get() { return t(this.key); }, enumerable: true });
});

// Kolor glowa życia (zielony — symbolizuje biosferę)
export const LIFE_GLOW_COLOR = 0x44ff88;

// Co ile lat gry sprawdzamy życie
const CHECK_INTERVAL = 1000;   // lat gry

export class LifeSystem {
  constructor(star) {
    this.star        = star;
    this._accumYears = 0;

    // Sprawdzaj życie co CHECK_INTERVAL lat
    EventBus.on('time:tick', ({ deltaYears }) => {
      this._accumYears += deltaYears;
      if (this._accumYears >= CHECK_INTERVAL) {
        this._accumYears = 0;
        this._checkAll();
      }
    });

    // Kolizja → zniszczenie życia (stopniowane wg mass ratio)
    EventBus.on('body:collision', ({ winner, loser, type }) => {
      // Loser ZAWSZE traci życie
      if (loser && loser.type === 'planet' && loser.lifeScore > 0) {
        loser.lifeScore = 0;
        EventBus.emit('life:extinct', { planet: loser, reason: t('life.extinctCollision') });
        EventBus.emit('life:updated',  { planet: loser });
      }

      // Winner: w absorpcji małego ciała przeżywa (ImpactDamageSystem obsługuje szkody)
      if (type === 'absorb' && winner && loser) {
        const ratio = (loser.physics?.mass ?? 0) / (winner.physics?.mass ?? 1);
        if (ratio < 0.1) return; // małe ciało — winner przeżywa
      }

      // Duże kolizje (deflection / duże absorpcje) — winner też traci życie
      if (winner && winner.type === 'planet' && winner.lifeScore > 0) {
        winner.lifeScore = 0;
        EventBus.emit('life:extinct', { planet: winner, reason: t('life.extinctCollision') });
        EventBus.emit('life:updated',  { planet: winner });
      }
    });
  }

  // ── Pętla sprawdzania ─────────────────────────────────────────
  _checkAll() {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    EntityManager.getByTypeInSystem('planet', sysId).forEach(planet => this._tick(planet));
  }

  _tick(planet) {
    // 1. Przelicz temperaturę wg bieżącej orbity (może się zmieniła przez akcje gracza)
    this._recalcTemp(planet);

    const prevScore = planet.lifeScore;
    const prevStage = LifeSystem.getStageFor(prevScore);
    const potential = this._calcPotential(planet);

    if (potential <= 0) {
      // Warunki niesprzyjające — życie zanika (lub nie powstaje)
      if (planet.lifeScore > 0) {
        planet.lifeScore = Math.max(0, planet.lifeScore - 8);
        if (planet.lifeScore === 0) {
          EventBus.emit('life:extinct', { planet, reason: t('life.extinctConditions') });
        }
        EventBus.emit('life:updated', { planet });
      }
      return;
    }

    // 2. Wzrost proporcjonalny do potencjału, spowalniany przy wyższych etapach
    const growth     = this._growthRate(planet.lifeScore) * potential;
    planet.lifeScore = Math.min(100, Math.round((planet.lifeScore + growth) * 10) / 10);

    const newStage = LifeSystem.getStageFor(planet.lifeScore);

    // 3. Emituj eventy przy przełomowych momentach
    if (prevScore === 0 && planet.lifeScore > 0) {
      EventBus.emit('life:emerged', { planet });
    } else if (newStage.min !== prevStage.min && planet.lifeScore > 0) {
      EventBus.emit('life:evolved', { planet, stage: newStage });
    }

    if (planet.lifeScore !== prevScore) {
      EventBus.emit('life:updated', { planet });
    }
  }

  // ── Temperatura równowagowa wg bieżącej orbity ────────────────
  // T_eq(K) = 278 × (1−albedo)^0.25 × L^0.25 / √a
  // + prosty efekt cieplarniany zależny od atmosfery (gameplay balance)
  // Uzasadnienie fizyczne: równanie Stefana–Boltzmanna nie uwzględnia greenhouseu;
  // planety skaliste z atmosferą są cieplejsze niż sama radiacja sugeruje
  _recalcTemp(planet) {
    const a     = planet.orbital.a;
    const T_rad = 278
      * Math.pow(1 - planet.albedo, 0.25)
      * Math.pow(this.star.luminosity, 0.25)
      / Math.sqrt(a);

    // Bonus cieplarniany wg typu atmosfery
    const greenhouse = { none: 0, thin: 15, breathable: 20, dense: 60, thick: 35 };
    const T_base_C = T_rad - 273.15;

    planet.temperatureC        = T_base_C + (greenhouse[planet.atmosphere] ?? 0);
    planet.temperatureK        = planet.temperatureC + 273.15;
    planet.surface.temperature = planet.temperatureC;
  }

  // ── Potencjał życia [0.0 – 1.0] ──────────────────────────────
  _calcPotential(planet) {
    // Tylko planety skaliste mogą mieć życie powierzchniowe
    if (planet.planetType === 'gas' || planet.planetType === 'ice') return 0;

    const tempC = planet.surface.temperature;

    // Zakres całkowicie wykluczający życie
    if (tempC < -35 || tempC > 85) return 0;

    // Składowa temperatury (optimum 0–50°C → 1.0)
    let tempScore;
    if (tempC >= 0 && tempC <= 50) {
      tempScore = 1.0;
    } else if (tempC < 0) {
      tempScore = (tempC + 35) / 35;        // liniowo -35→0
    } else {
      tempScore = 1 - (tempC - 50) / 35;    // liniowo 50→85
    }

    // Składowa stabilności orbity (< 0.3 = niemożliwe)
    if (planet.orbitalStability < 0.3) return 0;
    const stabScore = Math.min(1, (planet.orbitalStability - 0.3) / 0.5);

    // Składowa strefy HZ
    const hz      = this.star.habitableZone;
    const inHZ    = planet.orbital.a >= hz.min && planet.orbital.a <= hz.max;
    const nearDist = Math.min(
      Math.abs(planet.orbital.a - hz.min),
      Math.abs(planet.orbital.a - hz.max)
    );
    const hzScore = inHZ ? 1.0 : Math.max(0, 1 - nearDist / 0.6);

    // Składowa atmosfery
    const atmMap   = { none: 0.05, thin: 0.55, breathable: 1.0, thick: 1.0, dense: 0.7 };
    const atmScore = atmMap[planet.atmosphere] ?? 0.1;

    // Ważona suma (temperatura + HZ = 60% ważności)
    const basePotential = tempScore * 0.30 + stabScore * 0.20 + hzScore * 0.30 + atmScore * 0.20;

    // Bonus ze składu chemicznego: H₂O + C + P dają do +15% dodatkowego potencjału
    // lifeBonus() zwraca 0.0–0.15 (0 gdy brak kluczowych pierwiastków)
    const compBonus = lifeBonus(planet.composition);

    return Math.min(1.0, basePotential + compBonus);
  }

  // ── Szybkość wzrostu per etap ─────────────────────────────────
  _growthRate(score) {
    if (score < 20) return 3.5;    // prebiotic: szybki start
    if (score < 50) return 1.8;    // mikroby: średnio
    if (score < 80) return 0.9;    // złożone: wolno
    return 0.35;                    // cywilizacja: bardzo wolno
  }

  // ── Publiczne metody statyczne ────────────────────────────────

  // Pobierz etap dla danego wyniku (do użytku w innych modułach)
  static getStageFor(score) {
    if (score <= 0) return LIFE_STAGES[0];
    return LIFE_STAGES.find(s => score >= s.min && score <= s.max) ?? LIFE_STAGES[0];
  }
}
