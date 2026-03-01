// DistanceUtils — obliczenia odległości między ciałami niebieskimi
//
// Dwie metryki:
//   euclidean  — dynamiczna (zmienia się z orbitalnym ruchem), do UI i travel time
//   orbital    — stabilna (niezależna od fazy orbity), do sprawdzenia zasięgu statków
//
// Jednostka: AU (1 AU ≈ 150 mln km)

import { GAME_CONFIG } from '../config/GameConfig.js';
import EntityManager   from '../core/EntityManager.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX; // 110 px = 1 AU

export class DistanceUtils {

  // ── Euklidesowa (dynamiczna) ──────────────────────────────────────────────

  /**
   * Odległość euklidesowa z bieżących pozycji x,y → AU
   * Używa pikseli z physics (pozycja orbitalna), przelicza na AU
   */
  static euclideanAU(a, b) {
    const ax = a?.physics?.x ?? 0;
    const ay = a?.physics?.y ?? 0;
    const bx = b?.physics?.x ?? 0;
    const by = b?.physics?.y ?? 0;
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy) / AU_TO_PX;
  }

  /**
   * Odległość euklidesowa od homePlanet do entity → AU
   */
  static fromHomePlanetAU(entity) {
    const home = window.KOSMOS?.homePlanet;
    if (!home || entity === home) return 0;
    return DistanceUtils.euclideanAU(home, entity);
  }

  // ── Orbitalna (stabilna) ──────────────────────────────────────────────────

  /**
   * Odległość orbitalna = |a.orbital.a - b.orbital.a| (AU)
   * Stabilna, niezależna od fazy orbity — do gating zasięgu
   */
  static orbitalAU(a, b) {
    const aA = DistanceUtils._effectiveA(a);
    const bA = DistanceUtils._effectiveA(b);
    return Math.abs(aA - bA);
  }

  /**
   * Odległość orbitalna od homePlanet → AU
   */
  static orbitalFromHomeAU(entity) {
    const home = window.KOSMOS?.homePlanet;
    if (!home || entity === home) return 0;
    return DistanceUtils.orbitalAU(home, entity);
  }

  // ── Pomocnik ──────────────────────────────────────────────────────────────

  /**
   * Efektywna półoś wielka — dla moon → parent.orbital.a
   */
  static _effectiveA(entity) {
    if (!entity) return 0;
    if (entity.type === 'moon') {
      // Księżyc: użyj orbity planety-rodzica
      const parent = EntityManager.getByType('planet')
        .find(p => p.id === entity.parentPlanetId);
      return parent?.orbital?.a ?? entity.orbital?.a ?? 0;
    }
    return entity.orbital?.a ?? 0;
  }
}
