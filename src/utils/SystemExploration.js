// KANON „UKŁAD ZBADANY" — jedno źródło prawdy dla pytania „czy gracz zna ten układ".
//
// Powstało przy zamykaniu Findingów 186/187 (`docs/design/VESSEL_ORDERS_PLAN.md`), jako druga,
// STANOWA połowa W3-32: tamten finding nazwał obok pauzy z fałszywą treścią także „darmowy skan
// układu", a poprawka `61bdffe` zamknęła wyłącznie skan WIDOCZNY w popupie przylotu.
//
// ⚠ ŹRÓDŁEM PRAWDY JEST `galaxyStar.explored`, NIGDY `sysData.explored`. Stan trzymają DWA
//   obiekty: gwiazda w `galaxyData.systems` (trwała, wspólna dla mapy galaktyki) oraz rekord
//   `StarSystemManager._systems` (rejestr wygenerowanych układów). `generateAndRegister` zapalał
//   OBA, a `EmpireColonyBootstrap` gasił TYLKO pierwszy — więc lustro zostawało `true` na zawsze.
//   To nie jest domysł: repo obchodziło ten fakt w DWÓCH miejscach, zanim ktokolwiek nazwał go
//   defektem — `EmpireColonyBootstrap:612` („Reset explored=true które ssMgr… ustawia
//   automatycznie") i `Outliner:185-186` („sysData.explored zostaje true, więc filtrujemy po
//   galaxyStar"). Kanon nie wymyśla reguły, tylko przestaje ją przepisywać z pamięci.
//
// ⚠ FAIL-CLOSED, ODWROTNIE NIŻ `SystemScope.isSameSystem`. Tam brak stempla znaczy „przepuść",
//   bo cena fałszywego NEGATYWU to cichy paraliż floty. Tu cena fałszywego POZYTYWU to trwały
//   wyciek wywiadowczy — spis ciał obcego układu bez obserwatorium i wejście do jego widoku 3D —
//   który dodatkowo IDZIE DO ZAPISU. Przy mgle wojny „nie wiem" musi znaczyć „nie znam".
//
// ⚠ TEN PLIK NIE IMPORTUJE NICZEGO (wzór `ColonyOwnership.js`). `StarSystemManager` jest jego
//   konsumentem, więc import w drugą stronę byłby cyklem.
//
// ⚠ „ZBADANY" ≠ „WIDOCZNY". Ten kanon odpowiada wyłącznie na pytanie o WŁASNĄ eksplorację.
//   Wiedza z wywiadu (`IntelSystem.isAtLeast(empireId, 'rumor')`) i skan STRATCOM
//   (`ObservatorySystem.getSystemScanResult`) to OSOBNE kanały, celowo składane u konsumenta
//   (`FleetManagerOverlay:5541` robi `known = isHome || explored || empKnown`). Wciągnięcie ich
//   tutaj skleiłoby trzy różne pytania w jedno i odtworzyło defekt, który ten plik zamyka.

/** Identyfikator układu macierzystego — dom zna się z definicji, niezależnie od flag. */
export const HOME_SYSTEM_ID = 'sys_home';

/**
 * Czy gracz zbadał ten układ — wejście podstawowe, bierze GWIAZDĘ z `galaxyData.systems`.
 *
 * ⚠ BIERZE OBIEKT, NIE identyfikator, i odrzuca string JAWNIE. `'sys_ai'.explored` to
 *   `undefined`, więc bez tego strażnika podanie id po cichu dawałoby „niezbadany" dla układu
 *   zbadanego — czyli fałszywy negatyw zamiast błędu. Ta sama pułapka, na której stanął
 *   `ColonyOwnership.isPlayerColony` (opisana w komentarzu przez cztery commity, nieegzekwowana).
 *   Pytanie po identyfikatorze ma własne wejście: `isSystemExploredId`.
 */
export function isSystemExplored(star) {
  if (!star || typeof star !== 'object') return false;
  if (star.isHome === true) return true;
  if (star.id === HOME_SYSTEM_ID) return true;
  return star.explored === true;
}

/**
 * Wejście po identyfikatorze — dla konsumentów, którzy mają tylko `systemId`.
 * Rozwiązuje gwiazdę z `galaxyData`; brak wpisu ⇒ `false` (fail-closed).
 */
export function isSystemExploredId(systemId) {
  if (!systemId) return false;
  if (systemId === HOME_SYSTEM_ID) return true;
  const systems = (typeof window !== 'undefined' ? window.KOSMOS?.galaxyData?.systems : null);
  if (!Array.isArray(systems)) return false;
  return isSystemExplored(systems.find(s => s?.id === systemId));
}

/**
 * Wejście dla rekordu `StarSystemManager` (`getSystem`/`getAllSystems`).
 *
 * ⚠ ŚWIADOMIE NIE CZYTA `sysData.explored` — to lustro, które bootstrap AI zostawia zapalone.
 *   Czytamy dowiązaną `galaxyStar`, a gdy jej nie ma (po `restore` dowiązanie robi osobna pętla,
 *   `StarSystemManager:271-279`) — schodzimy na identyfikator.
 * ⚠ `sys_home` NIE MA wpisu w `galaxyData` po stronie rejestru (`registerHomeSystem` ustawia
 *   `galaxyStar: null` z komentarzem „home nie ma wpisu galaxy"), więc bez gałęzi domowej kanon
 *   zgasiłby graczowi jego własny układ.
 */
export function isSystemExploredData(sysData) {
  if (!sysData || typeof sysData !== 'object') return false;
  if (sysData.systemId === HOME_SYSTEM_ID) return true;
  if (sysData.galaxyStar) return isSystemExplored(sysData.galaxyStar);
  return isSystemExploredId(sysData.systemId);
}

/**
 * JEDYNY pisarz. Oznacza układ jako zbadany przez gracza.
 *
 * ⚠ Wołać wyłącznie dla zdarzeń GRACZA. Producent (`StarSystemManager.generateAndRegister`)
 *   generuje układ także dla obcych — przylot rajdera AI (Finding 187) i bootstrap imperium
 *   (Finding 186) generują układ, którego gracz nie widział na oczy.
 */
export function markSystemExplored(star) {
  if (!star || typeof star !== 'object') return false;
  star.explored = true;
  return true;
}
