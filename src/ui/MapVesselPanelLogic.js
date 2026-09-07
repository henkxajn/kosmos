// MapVesselPanelLogic — czysta reguła: KTÓRA powierzchnia obsługuje bieżące zaznaczenie mapy.
//
// PO CO OSOBNY MODUŁ (a nie `if` w UIManagerze): `UIManager` NIE IMPORTUJE SIĘ pod node
// (`THREE.TextureLoader is not a constructor` — ta sama ściana co `ColonyOverlay`; stub `three`
// celowo nie wystawia loadera i NIE WOLNO go podnosić). Reguła zaszyta w `UIManager` byłaby
// niepinowalna wykonaniem. Wzór: `FleetGroupPanelLogic`, `PanelDockLogic`, `ColonyModalLogic`.
//
// ZERO importów — moduł jest czysty i node-testowalny.

/**
 * Rozstrzyga powierzchnię dla bieżącego zaznaczenia statków na mapie 3D (D-MVP-3).
 *
 * ⚠ KLUCZEM JEST **LICZBA**, NIE DROGA DOJŚCIA. `removeFromSelection` przy N==2 też ląduje
 *   na N==1 — i ma dać ten sam wynik co świeży single-select. Gdyby reguła patrzyła na
 *   „jak tu trafiliśmy" (poprzedni stan, typ zdarzenia), te dwie drogi rozjechałyby się
 *   i panel migałby zależnie od historii kliknięć. Dlatego `prevCount` jest CELOWO ignorowany
 *   — przyjmujemy go tylko po to, żeby wołający nie musiał go odfiltrowywać.
 *
 * @param {string[]|null|undefined} vesselIds — `vesselIds` z `ui:selectionChanged`
 * @param {{ flagOn?: boolean, prevCount?: number }} [opts]
 *        flagOn — `FEATURES.mapVesselPanel`; `false` ⇒ zachowanie sprzed slice'u 258 (grupa od N==1)
 * @returns {'none'|'vessel'|'group'}
 */
export function resolveMapSelectionSurface(vesselIds, opts = {}) {
  const n = Array.isArray(vesselIds) ? vesselIds.length : 0;
  if (n === 0) return 'none';
  // Kill-switch: bez flagi pojedynczy statek obsługuje GRUPA, dokładnie jak przed 258.
  if (opts.flagOn === false) return 'group';
  return n === 1 ? 'vessel' : 'group';
}
