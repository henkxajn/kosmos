// FleetGroupPanelLogic — czyste helpery dla FleetGroupPanel (Slice 8b). Bez zależności
// UI/DOM/three — testowalne headless (wzór StationPanelLogic). Dwie funkcje: podsumowanie
// zaznaczonej grupy statków (agregaty do nagłówka) + budowa wierszy rostera. Zwraca
// liczby/KLUCZE (status/rozkaz), więc moduł jest locale-free (lokalizacja w widoku).

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
 *            fuelPct:number, totalUpkeep:number, immobilizedCount:number,
 *            weaponsCount:number, dockedCount:number, transitCount:number,
 *            orbitingCount:number }}
 */
export function summarizeFleetGroup(vessels, { vesselManager } = {}) {
  const list = vessels ?? [];
  let fuelCur = 0, fuelMax = 0, totalUpkeep = 0;
  let immobilizedCount = 0, weaponsCount = 0;
  let dockedCount = 0, transitCount = 0, orbitingCount = 0;
  for (const v of list) {
    fuelCur     += v?.fuel?.current ?? 0;
    fuelMax     += v?.fuel?.max ?? 0;
    totalUpkeep += vesselManager?.getVesselUpkeepCredits?.(v) ?? 0;
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
    immobilizedCount,
    weaponsCount,
    dockedCount, transitCount, orbitingCount,
  };
}

/**
 * Wiersze rostera — po jednym na statek. statusKey/orderKey to KLUCZE (widok → t()),
 * fuelPct/warpPct znormalizowane 0..1. hullId = shipId (widok rozwiązuje nazwę kadłuba).
 * @param {Array<object>} vessels
 * @param {{ vesselManager? }} deps
 * @returns {Array<{ id:string, name:string, hullId:string,
 *            statusKey:('docked'|'in_transit'|'orbiting'), fuelPct:number,
 *            warpPct:number, orderKey:(string|null), immobilized:boolean,
 *            hasWeapons:boolean, dockedAt:(string|null) }>}
 */
export function buildRosterRows(vessels, { vesselManager } = {}) {
  const list = vessels ?? [];
  return list.map((v) => {
    const fMax = v?.fuel?.max ?? 0;
    const wMax = v?.warpFuel?.max ?? 0;
    return {
      id:          v.id,
      name:        v.name ?? v.id,
      hullId:      v.shipId,
      statusKey:   v?.position?.state ?? 'docked',
      fuelPct:     fMax > 0 ? (v.fuel.current / fMax) : 0,
      warpPct:     wMax > 0 ? (v.warpFuel.current / wMax) : 0,
      orderKey:    v?.movementOrder?.type ?? v?.mission?.type ?? null,
      immobilized: !!vesselManager?.isImmobilized?.(v),
      hasWeapons:  _hasWeapons(v),
      dockedAt:    v?.position?.dockedAt ?? null,
    };
  });
}

/**
 * Liczba statków kwalifikujących się do każdej akcji grupowej (do wyszarzania przycisków).
 * - return: w przestrzeni (nie zadokowany) i nie unieruchomiony — recall do bazy ZAWSZE
 *           (niezależnie od misji; ścieżka = nearest friendly planet + auto-dock)
 * - refuel: zadokowany (manualRefuel wymaga state==='docked')
 * - stop:   ma aktywny rozkaz ruchu (cancelOrder zwróci false bez niego)
 * - retreat:w przestrzeni (nie zadokowany) i nie unieruchomiony
 * @param {Array<object>} vessels
 * @param {{ vesselManager? }} deps
 * @returns {{ canReturn:number, canRefuel:number, canStop:number, canRetreat:number,
 *            canUndock:number, canDock:number }}
 */
export function countActionable(vessels, { vesselManager } = {}) {
  const list = vessels ?? [];
  let canReturn = 0, canRefuel = 0, canStop = 0, canRetreat = 0, canUndock = 0, canDock = 0;
  for (const v of list) {
    const immob   = !!vesselManager?.isImmobilized?.(v);
    const state   = v?.position?.state;
    const docked  = state === 'docked';
    const hasActiveOrder = v?.movementOrder?.status === 'active';
    if (!docked && !immob)      canReturn++;
    if (docked)                 canRefuel++;
    if (hasActiveOrder)         canStop++;
    if (!docked && !immob)      canRetreat++;
    if (docked)                 canUndock++;   // Undock: zadokowany → orbita ciała
    if (!immob)                 canDock++;      // Dock: dowolny ruchomy (picker wybiera ciało)
  }
  return { canReturn, canRefuel, canStop, canRetreat, canUndock, canDock };
}
