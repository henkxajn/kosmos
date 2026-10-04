// ColonySelectionLogic — zaznaczenie jednostek na mapie kolonii trzyma WYŁĄCZNIE jednostki, które na tej mapie stoją
// (G2-4 F7, bramka live 2026-10-04).
//
// ⚠ `ColonyOverlay` trzyma zaznaczenie jako zbiór id (`_selectedUnits`) i referencję jednostki (`_selectedUnit`) — nic
//   ich nie czyściło, gdy jednostka trafiła do ładowni (okno ładowni otwiera Dowództwo, które ZAMYKA mapę kolonii — po
//   powrocie zbiór wciąż ją trzymał), zniknęła w terminie wycofania, przez R4 albo zginęła. Panel jednostki i szuflada
//   rysowały wtedy „ducha”, a klik w jego ikonę + PPM wysyłał `moveUnit` do jednostki z ładowni.
// ⚠ Czysta funkcja — zero importów (node-testowalna); `ColonyOverlay` woła ją przed rysowaniem mapy.

/**
 * @param {Iterable<string>} selectedIds — id zaznaczonych jednostek
 * @param {string|null} primaryId — id jednostki głównej (`_selectedUnit`)
 * @param {(id:string) => object|null} getUnit — odczyt rejestru jednostek (żywe obiekty)
 * @param {string} planetId — ciało oglądanej mapy
 * @returns {{ids: string[], primaryId: string|null, pruned: string[]}} — co zostaje, nowa jednostka główna, co wypadło
 */
export function pruneUnitSelection(selectedIds, primaryId, getUnit, planetId) {
  const onMap = (u) => !!u && u.planetId === planetId && u.status !== 'in_cargo' && (u.hp ?? 1) > 0;
  const ids = [];
  const pruned = [];
  for (const id of selectedIds ?? []) (onMap(getUnit(id)) ? ids : pruned).push(id);
  let primary = primaryId ?? null;
  if (primary !== null && !onMap(getUnit(primary))) {
    if (!pruned.includes(primary)) pruned.push(primary);
    primary = ids[0] ?? null;
  }
  return { ids, primaryId: primary, pruned };
}
