// TileOwnership — stempel właściciela na kaflach siatki kolonii (AI GARRISON G2-3b C-S3, Finding 318).
//
// Kafle kolonii AI powstawały z `owner = null` (`HexTile` domyślnie), bo bootstrap generował siatkę bez
// stempla, a jedyny stempel stawiał `ColonyOverlay._ensureGrid` — i to wyłącznie w gałęzi GENEROWANIA
// siatki, nigdy dla siatki już istniejącej. `owner == null` jest dla okupacji „obcym” kaflem także dla
// WŁASNYCH jednostek imperium (`GroundUnitManager._tickOccupation`: `tileOwner === owner` ⇒ pomiń), więc garnizon
// AI „zajmował” własną kolonię i resetował licznik okupacji gracza na wspólnym kaflu.
//
// Wołają: `EmpireColonyBootstrap` (dom, ekspansja, placówka — od urodzenia kolonii) i `GarrisonSystem.reconcile`
// (pierwszy tick — stare zapisy). Jedno źródło reguły „co stemplujemy”.
//
// ⚠ ZERO importów — moduł node-testowalny.

/**
 * Stempluje `tile.owner = ownerId` na kaflach BEZ właściciela (`owner == null`). Kafli już ostemplowanych
 * (np. zajętych okupacją przez gracza) NIE nadpisuje — lustro `ColonyOverlay._ensureGrid` (`defaultOwner`).
 * @param {HexGrid|null} grid
 * @param {string|null} ownerId — id imperium AI
 * @returns {number} ile kafli ostemplowano
 */
export function stampUnownedTiles(grid, ownerId) {
  if (!grid || !ownerId) return 0;
  let stamped = 0;
  for (const tile of grid.toArray?.() ?? []) {
    if (tile && tile.owner == null) { tile.owner = ownerId; stamped++; }
  }
  return stamped;
}
