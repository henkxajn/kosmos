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
// G2-4 F1 (Finding 363): `revertPeaceOccupation` — jedno źródło reguły „co pokój cofa” (woła `WithdrawalSystem`).
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

/**
 * G2-4 F1 (Finding 363, decyzja właściciela 2026-10-03) — POKÓJ COFA OKUPACJĘ na siatce jednej kolonii: kafle należące
 * do `occupier` (drugiej strony pokoju) wracają do `colonyOwner`, a licznik okupacji (`occupyEmpireId`/`occupyStart`)
 * jest zerowany, gdy należy do drugiej strony — albo do właściciela kolonii na kaflu, który właśnie wrócił.
 * Kafle i liczniki STRON TRZECICH (wojna z nimi trwa) — bez zmian, także licznik właściciela odbijającego kafel
 * zajęty przez stronę trzecią.
 * ⚠ Bez zdarzeń — emisję `tile:ownerChanged` robi wołający (`WithdrawalSystem`), ten moduł zostaje bez importów.
 * @param {HexGrid|null} grid
 * @param {string} colonyOwner — właściciel kolonii (`'player'` albo id imperium)
 * @param {string} occupier — druga strona pokoju (`'player'` albo id imperium)
 * @returns {{reverted: Array<{q:number, r:number, oldOwner:string}>, reset:number}}
 */
export function revertPeaceOccupation(grid, colonyOwner, occupier) {
  const out = { reverted: [], reset: 0 };
  if (!grid || !colonyOwner || !occupier || colonyOwner === occupier) return out;
  for (const tile of grid.toArray?.() ?? []) {
    if (!tile) continue;
    const taken = tile.owner === occupier;
    if (taken) {
      out.reverted.push({ q: tile.q, r: tile.r, oldOwner: tile.owner });
      tile.owner = colonyOwner;
    }
    const occ = tile.occupyEmpireId ?? null;
    if (occ !== null && (occ === occupier || (taken && occ === colonyOwner))) {
      tile.occupyEmpireId = null;
      tile.occupyStart = null;
      out.reset++;
    }
  }
  return out;
}
