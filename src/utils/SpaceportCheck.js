// SpaceportCheck — utility do walidacji portów kosmicznych
//
// Reguły:
//   - Małe statki (hull.size === 'small') NIE wymagają portu — startują/lądują wszędzie
//   - Średnie/duże (medium/large) wymagają portu na ciele dock/launch (chyba że hull.requiresSpaceport === false)
//   - Outposty bez portu blokują medium/large dla operacji dock/launch — pozostają na orbicie
//
// Wzór: deploy prefab z orbity OK (drop pods), ale fizyczny LAUNCH (dock → in_transit)
// i LANDING (in_transit → docked) wymagają portu dla medium/large.

import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import EntityManager from '../core/EntityManager.js';
import { launchFuelGravityMult } from '../data/LaunchFuelCost.js';

/**
 * Czy ten statek wymaga portu kosmicznego do dock/launch.
 * @param {object} vessel — VesselInstance
 * @returns {boolean}
 */
export function needsSpaceportForVessel(vessel) {
  if (!vessel) return true;
  const hull = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
  if (!hull) return true;
  if (hull.size === 'small') return false;
  return hull.requiresSpaceport !== false; // domyślnie true
}

/**
 * Czy dane ciało (planet/moon/planetoid) ma port kosmiczny w aktywnych budynkach.
 * Sprawdza poprzez ColonyManager → BuildingSystem aktywnej kolonii na tym ciele.
 *
 * @param {string} bodyId
 * @returns {boolean}
 */
export function hasSpaceportAt(bodyId) {
  if (!bodyId) return false;
  // S4-2 — stacja orbitalna = port uniwersalny (dokowanie/start bez bramki spaceport).
  if (EntityManager.get(bodyId)?.type === 'station') return true;
  const colMgr = window.KOSMOS?.colonyManager;
  if (!colMgr) return false;
  const colony = colMgr.getColony?.(bodyId);
  if (!colony) return false; // brak kolonii → brak portu
  return colony.buildingSystem?.hasSpaceport?.() ?? false;
}

/**
 * Czy statek może wystartować z aktualnego miejsca dokowania.
 * Sprawdza: jeśli vessel jest 'docked', body musi mieć port (dla medium/large).
 * Vessel w 'orbiting' lub 'in_transit' NIE wymaga sprawdzenia (już jest w przestrzeni).
 *
 * @param {object} vessel
 * @returns {{ok:boolean, reason?:string}} — ok:true gdy port OK lub nie wymagany
 */
export function canLaunchFromCurrent(vessel) {
  if (!vessel) return { ok: false, reason: 'no_vessel' };
  if (vessel.position?.state !== 'docked') return { ok: true }; // już w przestrzeni
  if (!needsSpaceportForVessel(vessel)) return { ok: true };
  const dockedAt = vessel.position.dockedAt;
  if (!dockedAt) return { ok: true }; // dock state bez ref — defensywnie zezwól
  if (hasSpaceportAt(dockedAt)) return { ok: true };
  return { ok: false, reason: 'no_spaceport_at_origin' };
}

/**
 * Ciało, z którego statek FIZYCZNIE startuje (do naliczenia dopłaty paliwowej za studnię
 * grawitacyjną — Reforma Etap 4). TYLKO gdy statek jest zadokowany; w locie / na orbicie jest
 * już w przestrzeni (brak studni). Lustro pierwszej linii canLaunchFromCurrent.
 *
 * @param {object} vessel — VesselInstance
 * @returns {object|null} encja ciała-źródła (planet/moon/planetoid/station) lub null
 *   (statek w przestrzeni / dock bez referencji / ciało nieznane) → wołający traktuje jako ×1.0
 */
export function resolveLaunchOriginBody(vessel) {
  if (vessel?.position?.state !== 'docked') return null; // już w przestrzeni — brak studni
  const dockedAt = vessel.position.dockedAt;
  if (!dockedAt) return null;                            // dock bez ref — fail-open
  return EntityManager.get(dockedAt) ?? null;            // ciało nieznane → null (fail-open)
}

/**
 * Mnożnik paliwa STARTU dla statku (Reforma Etap 4): dopłata za studnię grawitacyjną ciała-źródła.
 * Start z ciała naziemnego → wg pasma grawitacji (LAUNCH_FUEL_GRAVITY_MULT); start ze stacji lub
 * z otwartej przestrzeni → ×1.0. Fail-open na całej ścieżce: brak zadokowanego źródła / nieznana
 * grawitacja → ×1.0 (nigdy nie blokuje ani nie zawyża startu).
 *
 * @param {object} vessel — VesselInstance
 * @returns {number} mnożnik paliwa (×0.7 low / ×1.0 normal|stacja|przestrzeń / ×1.5 high)
 */
export function launchFuelMultiplierForVessel(vessel) {
  return launchFuelGravityMult(resolveLaunchOriginBody(vessel));
}
