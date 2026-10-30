// SystemRevealWorld — JEDYNY punkt składania kanałów kanonu mgły wojny układu (GALAXY_PLAN.md A14: „one pure assembler
// (moved out of FMO)” — wyciągnięty w NIEBO, bo etykiety nieba to pierwsza nowa powierzchnia z nazwami układów):
// oś MIEJSCA (`isSystemExplored` + ukończony skan STRATCOM obserwatorium) i oś WŁAŚCICIELA (`intelSystem.isAtLeast`) →
// `resolveSystemReveal` (Finding 188). Konsumenci: mapa galaktyki (`FleetManagerOverlay._systemReveal`), etykiety mapy
// układu (`HudLabelLayer._t1NameVisible`), etykiety nieba (`HudSkyLabelLayer`) i przyrządy bramki nieba (`ThreeRenderer`).
// ⚠ Nowa powierzchnia z nazwą układu składa kanały TUTAJ — druga kopia trzech kanałów to bliźniak, który się rozjedzie.
// Czysty względem świata: `K` (= `window.KOSMOS`) podaje wołający — bez `window` (atrapa w keeperze). Fail-closed: brak
// rekordu ⇒ nic (`resolveSystemReveal(null)`).
import { resolveSystemReveal } from './SystemReveal.js';
import { isSystemExplored } from './SystemExploration.js';

/**
 * Co wolno pokazać o układzie `sys` (rekord z `galaxyData.systems` — OBIEKT, nie identyfikator).
 * @param {object} K — `window.KOSMOS` (`intelSystem`, `observatorySystem`)
 * @param {object|null} sys
 */
export function systemRevealFromWorld(K, sys) {
  const intel = K?.intelSystem, obs = K?.observatorySystem;
  return resolveSystemReveal(sys, {
    explored:     isSystemExplored(sys),
    scanned:      !!obs?.getSystemScanResult?.(sys?.id),
    intelAtLeast: (lvl) => intel?.isAtLeast?.(sys?.empireId, lvl) === true,
  });
}
