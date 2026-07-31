// StationGroup — grupa „planeta + jej księżyce" jako JEDNA domena stacji orbitalnej (cap „1 stacja
// na grupę", C6c-1). Klucz grupujący = STRUKTURALNY parentPlanetId (Moon → id planety-rodzica,
// ustawiany przy generacji świata w SystemGenerator; używany przez PhysicsSystem; NIEZALEŻNY od
// jakiegokolwiek modułu HUB). Kotwica = planeta; księżyc kotwiczy na swoim parentPlanetId.
//
// ⚠ DEKOUPLING (decyzja C6c #1): to CZYSTA derywacja anchor/members — TA SAMA matematyka co
// SystemPoolService.js:204-227, ale WYCIĄGNIĘTA BEZ bramki HUB-eligibility. Ten plik NIE importuje
// SystemPoolService i NIE sprawdza logistics_hub / poolCoversSurvival. SystemPoolService pozostaje
// nietknięty (trzyma własną kopię derywacji). Wspólna jest TYLKO reguła „co należy do tej planety".

import EntityManager from '../core/EntityManager.js';

/** Kotwica grupy dla ciała: planeta = własne id; księżyc = parentPlanetId (fallback: własne id). */
export function stationGroupAnchorId(body) {
  if (!body) return null;
  return (body.type === 'moon' && body.parentPlanetId) ? body.parentPlanetId : body.id;
}

/**
 * Grupa „planeta + jej księżyce" dla DOWOLNEGO członka (planeta LUB księżyc).
 * @param {object} body — ciało (encja z EntityManager)
 * @returns {{ anchorId: string|null, memberBodyIds: string[] }}
 *          anchorId = planeta-kotwica; memberBodyIds = [anchor, ...księżyce(parentPlanetId===anchor)].
 *          Puste ({anchorId:null, memberBodyIds:[]}) gdy brak ciała.
 */
export function stationGroupOf(body) {
  const anchorId = stationGroupAnchorId(body);
  if (!anchorId) return { anchorId: null, memberBodyIds: [] };
  const memberBodyIds = [anchorId];
  for (const m of EntityManager.getByType('moon')) {
    if (m.parentPlanetId === anchorId) memberBodyIds.push(m.id);
  }
  return { anchorId, memberBodyIds };
}

const isPlayerStation = (s) => !s.ownerEmpireId || s.ownerEmpireId === 'player';

/**
 * Rozstrzygnij stan grupy dla capa (PURE — lookupy wstrzykiwane, headless-testowalne bez window.KOSMOS).
 * @param {{anchorId:string|null, memberBodyIds:string[]}} group
 * @param {{ getStationsAt:(bodyId:string)=>object[], getColony:(bodyId:string)=>object|null }} lookups
 * @returns {{ state:'build' }
 *   | { state:'exists',  station:object, stationBodyId:string }                       // stationBodyId = GDZIE stoi stacja
 *   | { state:'pending', order:object,   targetBodyId:string, issuerColonyId:string }} // targetBodyId=CEL; issuerColonyId=WYSTAWCA (cancel target)
 *
 * ⚠ Kształt zwrotu jest ROZŁĄCZNY per-stan (brak wspólnego, przeciążonego pola `bodyId`): każdy stan
 * niesie własne, jednoznacznie nazwane odniesienie do ciała. `stationBodyId` (exists) = lokalizacja
 * stacji (pewna z konstrukcji — bid z udanego getStationsAt). `targetBodyId` (pending) = cel zlecenia
 * (o.targetBodyId; NIE id kolonii-wystawcy, które może się różnić i nie jest potrzebne renderowi).
 * exists ma priorytet nad pending; oba nad build.
 */
export function resolveStationGroupState(group, { getStationsAt, getColony }) {
  const members = group?.memberBodyIds ?? [];
  const memberSet = new Set(members);
  // STATE exists — stacja GRACZA na dowolnym członku grupy.
  for (const bid of members) {
    const st = (getStationsAt?.(bid) ?? []).find(isPlayerStation);
    if (st) return { state: 'exists', station: st, stationBodyId: bid };
  }
  // STATE pending — pending order na dowolne ciało-członek (order trzymany na kolonii-wystawcy; matchujemy
  // po targetBodyId ∈ members, niezależnie od tego, która kolonia go wystawiła).
  for (const bid of members) {
    const col = getColony?.(bid);
    const po = (col?.pendingStationOrders ?? []).find(o => memberSet.has(o.targetBodyId));
    // issuerColonyId = kolonia-WYSTAWCA (getColony(bid) → planetId===bid); NIE viewing colony. Cancel MUSI
    // celować w wystawcę (C6c-2a — pending grupy może pochodzić z kolonii-rodzeństwa, nie oglądanej).
    if (po) return { state: 'pending', order: po, targetBodyId: po.targetBodyId, issuerColonyId: bid };
  }
  return { state: 'build' };
}

/**
 * C6c-3 — kolonia-GOSPODARZ zakładki Stacja dla grupy danej stacji (redirect z StationPanel „Zarządzaj").
 * Zakładka renderuje się dla PEŁNEJ kolonii gracza; wybierz kotwicę-planetę, inaczej pierwszą kolonię-członka.
 * Zwraca null gdy grupę hostuje wyłącznie outpost (tab się nie wyrenderuje → caller robi fallback) —
 * spójne z zaakceptowanym limitem outpostu (C6b).
 * @returns {object|null} kolonia gospodarz (posiada planetId) lub null
 */
export function resolveStationTabHost(station) {
  const colMgr = window.KOSMOS?.colonyManager;
  if (!station || !colMgr) return null;
  const group = stationGroupOf(EntityManager.get(station.bodyId));
  const isHost = (c) => c && !c.ownerEmpireId && !c.isTestEnemy && !c.isPreview && !c.isOutpost && c.civSystem;
  const anchorCol = colMgr.getColony?.(group.anchorId);
  if (isHost(anchorCol)) return anchorCol;
  for (const bid of group.memberBodyIds) { const c = colMgr.getColony?.(bid); if (isHost(c)) return c; }
  return null;
}
