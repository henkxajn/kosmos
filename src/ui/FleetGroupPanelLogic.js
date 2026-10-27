// FleetGroupPanelLogic — czyste helpery dla FleetGroupPanel (Slice 8b). Bez zależności
// UI/DOM/three — testowalne headless (wzór StationPanelLogic). Dwie funkcje: podsumowanie
// zaznaczonej grupy statków (agregaty do nagłówka) + budowa wierszy rostera. Zwraca
// liczby/KLUCZE (status/rozkaz), więc moduł jest locale-free (lokalizacja w widoku).

import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { resolveVesselStatus } from '../utils/VesselStatus.js';

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
 * Wiersze rostera — po jednym na statek. statusKey/orderKey to KLUCZE (widok → t()),
 * fuelPct/warpPct znormalizowane 0..1. hullId = shipId (widok rozwiązuje nazwę kadłuba).
 *
 * ⚠ Finding 266: statusKey to TOKEN KANONU (`utils/VesselStatus.resolveVesselStatus`), nie
 *   surowy `position.state` z domyślnym `'docked'`. Stan nierozpoznany = 'unknown' (fail-closed),
 *   orbita bez ciała = 'in_space'. `dockedAt` też idzie z kanonu (null dla in_transit/in_space).
 * @param {Array<object>} vessels
 * @param {{ vesselManager? }} deps
 * @returns {Array<{ id:string, name:string, hullId:string,
 *            statusKey:('docked'|'in_transit'|'orbiting'|'in_space'|'unknown'), fuelPct:number,
 *            warpPct:number, orderKey:(string|null), immobilized:boolean,
 *            hasWeapons:boolean, dockedAt:(string|null) }>}
 */
export function buildRosterRows(vessels, { vesselManager } = {}) {
  const list = vessels ?? [];
  return list.map((v) => {
    const fMax = v?.fuel?.max ?? 0;
    const wMax = v?.warpFuel?.max ?? 0;
    const st = resolveVesselStatus(v);
    return {
      id:          v.id,
      name:        v.name ?? v.id,
      hullId:      v.shipId,
      statusKey:   st.token,
      fuelPct:     fMax > 0 ? (v.fuel.current / fMax) : 0,
      warpPct:     wMax > 0 ? (v.warpFuel.current / wMax) : 0,
      orderKey:    v?.movementOrder?.type ?? v?.mission?.type ?? null,
      immobilized: !!vesselManager?.isImmobilized?.(v),
      hasWeapons:  _hasWeapons(v),
      dockedAt:    st.bodyId,
    };
  });
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
 * `deepSpaceCombatSystem._findActiveEncounterContaining(id)`. Jedno źródło dla panelu grupy (OFF), panelu grupy T6 (ON)
 * i znacznika walki członka (`FleetPanelHudLogic.pictureCtx`). Finding 562 (REFORMA ZAKŁADEK T6, strojenie 1).
 * @param {object} K — `window.KOSMOS` (podaje wołający; moduł bez `window`)
 * @returns {((vesselId:string) => boolean)|null} `null` — brak systemu walki
 */
export function combatCheckOf(K) {
  const dscs = K?.deepSpaceCombatSystem;
  return typeof dscs?._findActiveEncounterContaining === 'function' ? (id) => !!dscs._findActiveEncounterContaining(id) : null;
}
