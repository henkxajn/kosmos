// ObservatoryRange — ARC GALAXY, krok G2 (docs/design/GALAXY_PLAN.md §4 G2-2; D-GX-22): zasięg obserwatorium na mapie
// galaktyki w latach świetlnych — JEDNO źródło dla zakładki Stratcom (`FleetManagerOverlay._getStratcomRangeLY`, do G5),
// pingu obserwatorium na płycie (`HudGalaxyPingLayer`), bramki obcych blipów skoku warp i bramki [ Skanuj ] przypięcia.
//   • tabela poziom → ly przeniesiona z `FleetManagerOverlay` BEZ ZMIAN (Lv0–3 = 0 ly, Lv4 = 5, Lv5 = 10, Lv6+ = 15);
//   • środek = DOM, metryka PŁASKA (x, y galaktyki — płyta to dysk; status quo soczewki H5 i `inSensor` — D-GX-22);
//     Findingi 595 (płaska vs 3D) i 596 (środek w domu, nie w układzie obserwatorium) zostają zapisane — §7 O4.
// Czysty: bez `window`, bez importów — poziom obserwatorium i dom podaje wołający.

/** Zasięg [ly] wg poziomu obserwatorium imperium (indeks = poziom; powyżej tabeli — ostatni wpis). */
export const STRATCOM_LY_BY_LEVEL = Object.freeze([0, 0, 0, 0, 5, 10, 15]);

/** Zasięg obserwatorium [ly] dla poziomu `level` (ułamki i ujemne — w dół do całości, nie mniej niż 0). */
export function observatoryRangeLY(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 0) return STRATCOM_LY_BY_LEVEL[0];
  const i = Math.min(Math.floor(n), STRATCOM_LY_BY_LEVEL.length - 1);
  return STRATCOM_LY_BY_LEVEL[i];
}

/** Płaska odległość [ly] punktu galaktyki (x, y) od domu (x, y) — oś z (grubość dysku) pominięta (D-GX-22). */
export function planarDistanceLY(p, home) {
  const dx = (Number(p?.x) || 0) - (Number(home?.x) || 0);
  const dy = (Number(p?.y) || 0) - (Number(home?.y) || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Czy punkt galaktyki leży w zasięgu obserwatorium (zasięg 0 — nic, także sam dom nie „wchodzi”). */
export function inObservatoryRange(p, home, rangeLY) {
  return rangeLY > 0 && planarDistanceLY(p, home) <= rangeLY;
}
