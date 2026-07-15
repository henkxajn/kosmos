// ShipBuildRules — gdzie można zbudować dany kadłub (S3.4d, gating stoczni).
//
// Reguła (design zatwierdzony przez Filipa):
//   • Stocznia NAZIEMNA (kolonijna) — TYLKO kadłuby z groundBuildable:true (obecnie: hull_small).
//   • Stocznia ORBITALNA (stacja)   — WSZYSTKO (medium/large + fregata/niszczyciel/krążownik).
//
// Twardy gate, bez furtek: default-DENY na ziemi. Nowy kadłub bez flagi groundBuildable
// jest domyślnie tylko-orbitalny — świadoma decyzja bezpieczeństwa (nie da się przypadkiem
// odblokować budowy floty wojennej w kolonii przez dodanie kadłuba bez przemyślenia).
//
// AI zwolnione z gatingu — bramka konsumowana wyłącznie dla kolonii/spawnów GRACZA
// (dyskryminator: ColonyManager.isPlayerColony). Patrz docs/audits/s34d-hull-gating-audit.md.

import { HULLS } from './HullsData.js';
import { SHIPS } from './ShipsData.js';

// Zwraca definicję kadłuba/statku po ID — parytet z chokepointami budowy
// (ColonyManager.startShipBuild, StationSystem.queueStationShip, Vessel.createVessel:
//  wszystkie robią `SHIPS[id] ?? HULLS[id]`). SHIPS to legacy/martwy kod w UI, ale
// zachowujemy lookup dla spójności (spawny dev/scenario nadal ich używają).
export function getShipSpec(shipId) {
  return SHIPS[shipId] ?? HULLS[shipId] ?? null;
}

/**
 * Czy dany kadłub można zbudować w danym typie stoczni.
 * @param {string} shipId       — id kadłuba (HULLS) lub statku (SHIPS)
 * @param {'ground'|'orbital'} facilityType — 'ground' = stocznia kolonijna, 'orbital' = stacja
 * @returns {boolean}
 */
export function canBuildHullAt(shipId, facilityType) {
  if (facilityType === 'orbital') return true;         // stacja orbitalna buduje wszystko
  const spec = getShipSpec(shipId);
  return !!spec && spec.groundBuildable === true;      // naziemna: tylko jawnie dozwolone (default-deny)
}
