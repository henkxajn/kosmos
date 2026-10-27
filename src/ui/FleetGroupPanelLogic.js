// FleetGroupPanelLogic — czyste helpery grupy statków (Slice 8b; od REFORMY ZAKŁADEK T6 / T4 — panel floty i grupy
// w idiomie etykiet, `FleetPanelHudLogic`). Bez zależności UI/DOM/three — testowalne headless (wzór StationPanelLogic):
// podsumowanie zaznaczonej grupy (agregaty linii zbiorczej), liczniki rozkazów grupowych (wyszarzanie chipów) i predykat
// „w aktywnym starciu”. Zwraca liczby, więc moduł jest locale-free (lokalizacja w widoku). Wiersze rostera dawnego panelu
// grupy (`buildRosterRows`) usunięte w T4 razem z jego rysunkiem.

import { SHIP_MODULES } from '../data/ShipModulesData.js';

// Czy statek ma jakikolwiek moduł broni. Inline (mirror Vessel.hasWeapons) — nie ciągniemy
// łańcucha i18n z Vessel.js do czystej logiki; ShipModulesData to czyste dane.
function _hasWeapons(vessel) {
  if (!vessel?.modules) return false;
  for (const modId of vessel.modules) {
    if (SHIP_MODULES[modId]?.slotType === 'weapon') return true;
  }
  return false;
}

/**
 * Podsumowanie zaznaczonej grupy statków — agregaty do nagłówka panelu.
 * @param {Array<object>} vessels — żywe statki gracza (już przefiltrowane przez widok).
 * @param {{ vesselManager? }} deps
 * @returns {{ count:number, totalCount:number, fuelCur:number, fuelMax:number,
 *            fuelPct:number, totalUpkeep:number, reserveCount:number, reserveUpkeep:number,
 *            immobilizedCount:number, weaponsCount:number, dockedCount:number,
 *            transitCount:number, orbitingCount:number }}
 */
export function summarizeFleetGroup(vessels, { vesselManager } = {}) {
  const list = vessels ?? [];
  let fuelCur = 0, fuelMax = 0, totalUpkeep = 0;
  let immobilizedCount = 0, weaponsCount = 0;
  let dockedCount = 0, transitCount = 0, orbitingCount = 0;
  let reserveCount = 0, reserveUpkeep = 0;
  for (const v of list) {
    fuelCur     += v?.fuel?.current ?? 0;
    fuelMax     += v?.fuel?.max ?? 0;
    // W2-5: stawka z `getVesselUpkeepCredits` jest EFEKTYWNA (rezerwa 10 %), więc suma
    // nie kłamie bez żadnego rozgałęzienia tutaj. Rozbicie liczymy osobno, bo „ile z tego
    // to magazyn" jest inną informacją niż „ile płacę razem".
    const up = vesselManager?.getVesselUpkeepCredits?.(v) ?? 0;
    totalUpkeep += up;
    // ⚠ Predykat inline (mirror `isInService`) — ten moduł jest czysty i nie ciągnie
    //   łańcucha i18n z `Vessel.js`; ta sama konwencja co `_hasWeapons` wyżej.
    if ((v?.serviceState ?? 'active') !== 'active') { reserveCount++; reserveUpkeep += up; }
    if (vesselManager?.isImmobilized?.(v)) immobilizedCount++;
    if (_hasWeapons(v)) weaponsCount++;
    const st = v?.position?.state;
    if (st === 'docked')          dockedCount++;
    else if (st === 'in_transit') transitCount++;
    else if (st === 'orbiting')   orbitingCount++;
  }
  return {
    count: list.length,
    totalCount: list.length,
    fuelCur, fuelMax,
    fuelPct: fuelMax > 0 ? fuelCur / fuelMax : 0,
    totalUpkeep,
    reserveCount, reserveUpkeep,
    immobilizedCount,
    weaponsCount,
    dockedCount, transitCount, orbitingCount,
  };
}

/**
 * Liczba statków kwalifikujących się do każdej akcji grupowej (do wyszarzania przycisków).
 * ⚠ Slice 258 / A1 — `canReturn` USUNIĘTE razem z przyciskiem „Powrót" (rozjazd słownika
 *   N==1 vs N>=2; rejestr nie ma tej akcji od Findingu 145 (a')). Nikt inny go nie czytał.
 * - refuel: zadokowany (manualRefuel wymaga state==='docked')
 * - stop:   ma aktywny rozkaz ruchu (cancelOrder zwróci false bez niego)
 * - retreat:w AKTYWNYM STARCIU — ten sam predykat co bramka MOS `_issueRetreat` (`not_in_combat`):
 *           `deepSpaceCombatSystem._findActiveEncounterContaining` (`combatCheckOf`). ⚠ Finding 562 (REFORMA
 *           ZAKŁADEK T6, strojenie 1): dawniej „w przestrzeni i nie unieruchomiony” — przycisk aktywny poza walką,
 *           a MOS po cichu odmawiał każdemu statkowi. Unieruchomienie i rezerwa NIE gaszą przycisku — ucieczka
 *           z bitwy przebija obie bramki (D-FDk). Bez `combatCheck` (brak systemu walki) — 0: MOS odmawia wtedy
 *           każdemu odwrotowi (fail-closed jak bramka).
 * @param {Array<object>} vessels
 * @param {{ vesselManager?, combatCheck?:(vesselId:string) => boolean }} deps
 * @returns {{ canRefuel:number, canStop:number, canRetreat:number,
 *            canUndock:number, canDock:number }}
 */
export function countActionable(vessels, { vesselManager, combatCheck = null } = {}) {
  const list = vessels ?? [];
  const inCombat = typeof combatCheck === 'function' ? (v) => !!combatCheck(v?.id) : () => false;
  let canRefuel = 0, canStop = 0, canRetreat = 0, canUndock = 0, canDock = 0;
  for (const v of list) {
    const immob   = !!vesselManager?.isImmobilized?.(v);
    const state   = v?.position?.state;
    const docked  = state === 'docked';
    const hasActiveOrder = v?.movementOrder?.status === 'active';
    if (docked)                 canRefuel++;
    if (hasActiveOrder)         canStop++;
    if (inCombat(v))            canRetreat++;   // Finding 562 — lustro MOS `not_in_combat` (D-FDk: także unieruchomiony)
    if (docked)                 canUndock++;   // Undock: zadokowany → orbita ciała
    if (!immob)                 canDock++;      // Dock: dowolny ruchomy (picker wybiera ciało)
  }
  return { canRefuel, canStop, canRetreat, canUndock, canDock };
}

/**
 * Predykat „statek w aktywnym starciu” — TEN SAM, którym MOS bramkuje odwrót: `_issueRetreat` → `not_in_combat`,
 * `deepSpaceCombatSystem._findActiveEncounterContaining(id)`. Jedno źródło dla panelu grupy T6 („Odwrót”) i znacznika walki
 * członka (`FleetPanelHudLogic.pictureCtx`). Finding 562 (REFORMA ZAKŁADEK T6, strojenie 1).
 * @param {object} K — `window.KOSMOS` (podaje wołający; moduł bez `window`)
 * @returns {((vesselId:string) => boolean)|null} `null` — brak systemu walki
 */
export function combatCheckOf(K) {
  const dscs = K?.deepSpaceCombatSystem;
  return typeof dscs?._findActiveEncounterContaining === 'function' ? (id) => !!dscs._findActiveEncounterContaining(id) : null;
}
