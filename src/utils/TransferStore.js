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

/**
 * S3.4c (D1) — rozwiąż kolonię-matkę stacji. JEDNO źródło prawdy dla magazynu (proxy StationDepot,
 * D2) I dla bonusu tradeCapacity (CivilianTradeSystem, D7). Kolejność:
 *   guard AI → stamp `ownerColonyId` → per-body → parent (księżyc) → jedyna kolonia gracza w systemie
 *   → null (brak matki → sierota trzyma własny depot).
 * Rozwiązuje żywą kolonię gracza (z resourceSystem); nieaktualny/martwy stamp cicho spada na fallbacki.
 * @param {object} station — encja Station
 * @returns {object|null} colony (posiada resourceSystem) | null (sierota)
 */
// Kolonia gracza (AI ma ownerEmpireId = id imperium; gracz null/undefined/'player').
const _isPlayerCol = (c) => !!c && (!c.ownerEmpireId || c.ownerEmpireId === 'player') && !!c.resourceSystem;

/**
 * SILNY link matki: stamp `ownerColonyId` → per-body → parent (księżyc). BEZ „jedyna w systemie"
 * (to słaby fallback tylko dla passive resolvera). Ignoruje `depotDetached`. Baza wspólna dla
 * `resolveHomeColony` (proxy) I `resolveReadoptionColony` (adopcja Z8) — JEDNO źródło prawdy linku.
 * @returns {object|null} żywa kolonia gracza (z resourceSystem) lub null
 */
function _strictMotherLink(station) {
  const colMgr = window.KOSMOS?.colonyManager;
  if (!colMgr) return null;
  // 1. Stamp — jawnie wyznaczona matka (płatnik z budowy). Musi być żywą kolonią gracza.
  if (station.ownerColonyId) {
    const c = colMgr.getColony?.(station.ownerColonyId);
    if (_isPlayerCol(c)) return c;
  }
  // 2. Per-body — kolonia gracza na ciele, wokół którego orbituje stacja.
  const perBody = colMgr.getColony?.(station.bodyId);
  if (_isPlayerCol(perBody)) return perBody;
  // 3. Parent — księżyc → kolonia gracza na planecie-rodzicu.
  const body = EntityManager.get(station.bodyId);
  const parentId = body?.parentPlanetId;
  if (parentId) {
    const parentCol = colMgr.getColony?.(parentId);
    if (_isPlayerCol(parentCol)) return parentCol;
  }
  return null;
}

export function resolveHomeColony(station) {
  // Guard: stacje AI NIGDY nie sięgają magazynu gracza (Wariant A + mgła wojny).
  if (!station || station.ownerEmpireId !== 'player') return null;
  // Sierota po zniszczeniu matki (D5) — wymuszony własny depot (bez PASSIVE re-motheringu; adopcja
  // Z8 czyści flagę wyłącznie przez event colony:founded / restore, nie tu).
  if (station.depotDetached) return null;
  const colMgr = window.KOSMOS?.colonyManager;
  if (!colMgr) return null;

  // 1-3. Silny link (stamp / per-body / parent).
  const strict = _strictMotherLink(station);
  if (strict) return strict;

  // 4. Jedyna kolonia gracza w systemie stacji (gdy DOKŁADNIE 1 — brak dwuznaczności). SŁABY fallback
  //    tylko dla passive resolvera; NIE użyty w adopcji (D5: orphan nie łapie się na losową kolonię).
  const inSys = (colMgr.getColoniesInSystem?.(station.systemId) ?? []).filter(_isPlayerCol);
  if (inSys.length === 1) return inSys[0];

  // 5. Brak jednoznacznej matki → sierota (własny depot).
  return null;
}

/**
 * S3.4c (Z8) — czy osierocona stacja MA silny link do żywej kolonii-matki? Ignoruje `depotDetached`
 * (to jest test „czy MOŻNA adoptować"). Tylko SILNY link (stamp/per-body/parent) — BEZ „jedyna
 * w systemie" (D5: orphan nie adoptuje się do niepowiązanej kolonii w systemie). Zwraca kolonię lub null.
 */
export function resolveReadoptionColony(station) {
  if (!station || station.ownerEmpireId !== 'player') return null;
  return _strictMotherLink(station);
}
