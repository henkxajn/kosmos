// TransferStore — resolver „magazyn dla transferu cargo/paliwa" (S3.3b-S3b).
// Cel/źródło transportu i tankowania może być KOLONIĄ lub STACJĄ (HUB handlowy). Oba mają identyczny
// kontrakt resourceSystem-podobny (receive/spend/getAmount/inventory Map). Jeden punkt prawdy
// „kolonia LUB stacja" — reuse: MissionSystem (pętla cargo), VesselManager (tankowanie).

import EntityManager from '../core/EntityManager.js';

/**
 * Rozwiąż magazyn (resourceSystem-podobny) dla id ciała/stacji.
 * @param {string} id — id kolonii (planeta/outpost) LUB stacji
 * @returns {object|null} colony.resourceSystem | station.depot | null
 */
export function resolveTransferStore(id) {
  if (!id) return null;
  const colony = window.KOSMOS?.colonyManager?.getColony?.(id);
  if (colony?.resourceSystem) return colony.resourceSystem;
  const ent = EntityManager.get(id);
  if (ent?.type === 'station' && ent.depot) return ent.depot;
  return null;
}

/** Czy id wskazuje na stację (rozgałęzienie dockAtStation vs dockAtColony). */
export function isStationId(id) {
  return EntityManager.get(id)?.type === 'station';
}
