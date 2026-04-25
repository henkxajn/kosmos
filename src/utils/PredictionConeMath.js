// PredictionConeMath — pure functions do obliczania prediction cone
// dla intercept orderów (M2b Commit 3, design doc §8).
//
// Cone reprezentuje wizualny stożek niepewności wokół punktu intercept'u
// (renderer C4 narysuje go w ThreeRenderer; tu tylko math, zero state/UI).
//
// Jednostki argumentów (UWAGA — różne):
//   pursuerPos / targetPos   — piksele (vessel.position.x/y convention)
//   pursuerSpeedAU           — AU/gameYear (vessel.speedAU; physics tier)
//   targetVelocity.vx/vy     — AU/civYear  (vessel.velocity z VesselManager
//                              ._updateVelocityFromDelta — civ tier)
//   gameYear                 — physics gameYear (timeSystem.gameTime)
//
// CIV_TIME_SCALE conversion: targetVelocity konwertowane do AU/gameYear
// PRZED obliczeniem driftu. Bez tej konwersji iloczyn `velMag × time` jest
// 12× za mały (CIV_TIME_SCALE=12) — spec §8.1 nie uwzględniał, naprawione tu.
//
// DRIFT_RATIO_CAP zabezpiecza angleWidth przed eksplozją >180° dla
// extreme velocity/distance combinations (spec §8.1 BASE_ANGLE_RAD był
// kalibrowany dla velocityFactor ~1-3, nie 60+).

import { GAME_CONFIG } from '../config/GameConfig.js';

const AU_TO_PX        = GAME_CONFIG.AU_TO_PX;
const CIV_TIME_SCALE  = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const BASE_ANGLE_RAD  = 0.1;   // ~5.7° dla detailed + static target
const DRIFT_RATIO_CAP = 5;     // max driftRatio — cone > 180° nie ma sensu

export const PredictionConeMath = {

  /**
   * Mapowanie jakości obserwacji (IntelSystem.vessels) → mnożnik szerokości
   * stożka. Im gorsza jakość, tym szerszy stożek (większa niepewność).
   * @param {string} quality — 'detailed' | 'contact' | 'rumor' | other
   * @returns {number}
   */
  qualityToAngleMultiplier(quality) {
    switch (quality) {
      case 'detailed': return 0.2;   // ~1.1° z BASE
      case 'contact':  return 0.6;   // ~3.4°
      case 'rumor':    return 1.5;   // ~8.6°
      default:         return 3.0;   // unknown / brak kontaktu
    }
  },

  /**
   * Oblicz prediction cone od pursuera do targetu.
   *
   * @param {{x:number,y:number}} pursuerPos
   * @param {{x:number,y:number}} targetPos                     — w intercept: ip (intercept point), NIE obecna pozycja targetu
   * @param {{vx:number,vy:number}|null|undefined} targetVelocity — AU/civYear lub brak
   * @param {number} pursuerSpeedAU                             — AU/gameYear
   * @param {string} obsQuality                                 — 'detailed'|'contact'|'rumor'|'unknown'
   * @param {number} gameYear                                   — physics gameYear (timestamp)
   * @returns {{originX:number,originY:number,dirX:number,dirY:number,angleWidth:number,rangeAU:number,confidence:number,updatedYear:number}|null}
   */
  computeCone(pursuerPos, targetPos, targetVelocity, pursuerSpeedAU, obsQuality, gameYear) {
    const dx = targetPos.x - pursuerPos.x;
    const dy = targetPos.y - pursuerPos.y;
    const distPx = Math.hypot(dx, dy);
    if (distPx < 1) return null;  // degenerate: pursuer praktycznie w targecie

    const distAU = distPx / AU_TO_PX;
    // timeToIntercept w gameYears (spójne z pursuerSpeedAU = AU/gameYear).
    const timeToInterceptGameYears = distAU / Math.max(0.01, pursuerSpeedAU);

    // Konwersja AU/civYear → AU/gameYear (CIV_TIME_SCALE=12).
    // Bez tego iloczyn w `targetDriftAU` byłby 12× za mały.
    const velMagCivPerYear  = Math.hypot(targetVelocity?.vx ?? 0, targetVelocity?.vy ?? 0);
    const velMagPhysPerYear = velMagCivPerYear * CIV_TIME_SCALE;
    const targetDriftAU     = velMagPhysPerYear * timeToInterceptGameYears;

    // Drift jako frakcja dystansu — dimensionless, intuicyjne
    // ("target przesunie się X razy dalej niż dystans intercept'u").
    // Cap przy 5× — dla extreme inputs cone byłby >180° co nie ma sensu.
    const driftRatio = Math.min(
      targetDriftAU / Math.max(0.01, distAU),
      DRIFT_RATIO_CAP,
    );
    const velocityFactor = 1 + driftRatio;

    const qualityMult = PredictionConeMath.qualityToAngleMultiplier(obsQuality);
    const angleWidth  = BASE_ANGLE_RAD * velocityFactor * qualityMult;

    return {
      originX:     pursuerPos.x,
      originY:     pursuerPos.y,
      dirX:        dx / distPx,
      dirY:        dy / distPx,
      angleWidth,
      rangeAU:     distAU,
      confidence:  1 / (1 + qualityMult),
      updatedYear: gameYear ?? 0,
    };
  },
};
