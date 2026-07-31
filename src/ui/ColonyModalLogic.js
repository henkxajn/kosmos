// ── Stan modali pełnoekranowych ColonyOverlay — pure, headless-testowalne ─────────────────────────
// JEDNO źródło prawdy: które flagi overlayu oznaczają MODAL NA PEŁNYCH BOUNDACH (backdrop przykrywa
// CAŁY overlay). Takie modale muszą chować rodzeństwo-warstwy renderowane na OSOBNYM elemencie canvas
// NAD ui-canvas — w praktyce globus 3D (PlanetGlobeRenderer, z-index 3): backdrop 2D rysowany w ui-canvas
// (z-index 2) NIE zasłoni innego elementu DOM o wyższym z-index. Stąd twardy toggle display:none.
//
// ⚠ Nowy modal pełnoekranowy (backdrop na całych boundach overlayu) → dodaj JEGO flagę TU, nie duplikuj
//   OR-chaina w call-site'ach (globe toggle, ewentualni przyszli konsumenci czytają jeden predykat).
//   Obecni: picker stacji (moduł + statek) + modal rekrutacji jednostek naziemnych (draft).
export function anyFullBoundsModalOpen(flags) {
  if (!flags) return false;
  return !!(flags.stationPickerOpen || flags.stationShipPickerOpen || flags.draftOpen);
}
