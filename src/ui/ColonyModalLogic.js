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

// Command bliźniaczy do predykatu: DOMKNIJ wszystkie modale pełnoekranowe overlayu (mutuje obiekt-stan:
// zeruje flagi + hide panelu draftu). JEDNO źródło prawdy „które flagi = modal pełnoekranowy" wspólne z
// anyFullBoundsModalOpen — nowy modal → dodaj TU i w predykacie (nie rozsypuj resetów po call-site'ach).
// Wołane przy (re)otwarciu/przełączeniu kolonii przez openPanel (ColonyOverlay.show — top bar, Outliner,
// BottomContext, CivilizationOverlay, EventLogOverlay), które syncują _selectedColonyId ale NIE przechodzą
// przez _switchColony (jedyny dotąd resetujący). Bez tego flaga zostaje true po zmianie kolonii →
// globus schowany, a picker rysowałby dane starej stacji. Idempotentne; null-safe.
export function closeFullBoundsModals(overlay) {
  if (!overlay) return;
  overlay._stationPickerOpen = false;
  overlay._stationShipPickerOpen = false;
  overlay._draftOpen = false;
  overlay._draftPanel?.hide?.();
}
