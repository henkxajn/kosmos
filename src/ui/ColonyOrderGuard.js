// D4 / OG-4 — BRAMKA ROZKAZÓW PANELU KOLONII: co wolno kliknąć na CUDZEJ koloni.
//
// PO CO: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §D4 (PODPISANA 2026-08-22: W3 + „flash
// z powodem"). `ColonyOverlay` ma ZAPROJEKTOWANY podgląd obcej planety (`_openAsColonyPanel`:
// „dla konkretnej planety (własnej LUB obcej)") — desant, ostrzał orbitalny, grupa badawcza.
// Panel rysował jednak dla takiej koloni PEŁEN zestaw rozkazów: 8 etykiet pływającego panelu
// budowy + 6 etykiet zakładki Załoga.
//
// ⚠ TO NIE DUBLUJE D1/D2 — TO INNA POWIERZCHNIA. Bramki szyny (D2) nie widzą tych klików, bo
//   `_onHit` mutuje `colony.civSystem` / `colony.buildingSystem` **BEZPOŚREDNIO**
//   (`setStrataFocus`, `setStrataTarget`, instalacja droida). D1 też ich nie zasłania: podgląd
//   idzie przez `show({colonyId})`, które ŚWIADOMIE nie woła `switchActiveColony`.
//
// ⚠ MODUŁ JEST CZYSTY (importuje wyłącznie kanon własności) — bo `ColonyOverlay.js` NIE IMPORTUJE
//   SIĘ POD NODE (wywraca się na `THREE.TextureLoader`). Wyciągnięcie tablicy decyzji tutaj
//   zamienia pin ŹRÓDŁOWY na pin WYKONANIOWY. Precedens w tym samym pliku: `ColonyModalLogic.js`.
//
// ⚠ ALLOWLISTA, NIE BLOKLISTA — i to jest decyzja, nie wygoda. Nowa etykieta hitu jest domyślnie
//   ZABLOKOWANA na cudzej koloni. Wariant odwrotny („blokujemy wymienione") przecieka przy każdym
//   przyszłym producencie, który zapomni się dopisać — a `draft_open:1949` jest w tym pliku żywym
//   dowodem tej klasy porażki.

import { isPlayerColony } from '../utils/ColonyOwnership.js';

/**
 * Etykiety hitów dozwolone ZAWSZE — także na koloni, która nie należy do gracza.
 *
 * ⚠ TRZY RODZINY, KAŻDA Z INNEGO POWODU:
 *  1. NAWIGACJA I CZYTANIE — bez nich panel obcej koloni staje się pułapką bez wyjścia.
 *     `close` MUSI tu być: gracz, który zrzucił desant, inaczej nie zamknie panelu.
 *  2. WARSTWA DOWODZENIA DESANTEM (`unit*`, `army*`, `stack*`, `drawer*`) — zakresowana po
 *     `unit.owner`, NIE po koloni. To są MOJE oddziały stojące na CUDZYM terenie; zablokowanie
 *     ich odebrałoby graczowi dowodzenie dokładnie w chwili, gdy go potrzebuje.
 *  3. ABSORBERY I ZAMKNIĘCIA MODALI — modal otwarty (choćby przez błąd) musi dać się zamknąć.
 */
export const ALWAYS_ALLOWED_HITS = new Set([
  // 1. nawigacja / czytanie
  'close', 'deselectHex', 'infoTab', 'colonyTab', 'floatPanel', 'headerBuilding',
  'cycleHexUnit', 'strataRow', 'targetState',
  // 2. dowodzenie desantem — zakres po `unit.owner`, nie po koloni
  'unitSurvey', 'unitAnalyze', 'unitDeselect', 'unitAttack', 'unitSupportStart',
  'unitClearSupport', 'unitDeploy', 'unitPackUp', 'unitCancelDeploy',
  'stackRowClick', 'stackSelectAll',
  'armyCreate', 'armyCreateFromSelection', 'armyDisband', 'armyRename',
  'armySplit', 'armySplitFromDrawer',
  'drawerUnitClick', 'drawerOpenUnit', 'drawerOpenGroup',
  // 3. absorbery / zamknięcia modali
  'station_mgmt_picker_close', 'station_mgmt_picker_bg',
  'station_mgmt_shippicker_close', 'station_mgmt_shippicker_bg',
]);

/**
 * Czy na tej koloni wolno wydawać rozkazy.
 *
 * ⚠ ZAWODZI OTWARCIE przy braku koloni — podgląd planety bez koloni (`isPreview`) i konteksty
 *   bez rozwiązanej koloni mają WŁASNE bramki (`!colony.isPreview` u producentów). Termin
 *   własności nie ma tam czego orzekać i nie może udawać, że ma.
 */
export function canIssueColonyOrders(colony) {
  if (!colony) return true;
  return isPlayerColony(colony);
}

/**
 * Czy ten konkretny klik ma zostać odrzucony (inwariant na górze `_onHit`).
 *
 * ⚠ ODMOWA JEST GŁOŚNA — wołający pokazuje flash z powodem (`ui.notYourColony`). Cicha odmowa
 *   w panelu, który dalej rysuje przyciski, uczy gracza wyłącznie tego, że gra jest zepsuta.
 */
export function isColonyOrderBlocked(hitType, colony) {
  if (ALWAYS_ALLOWED_HITS.has(hitType)) return false;
  return !canIssueColonyOrders(colony);
}
