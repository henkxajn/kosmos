// LayoutConfig — stałe wymiarów paneli UI
//
// Dwa layouty: COSMIC (widok kosmiczny) i GLOBE (widok globusa planety).
// Importowane przez UIManager, TopBar, Outliner, BottomContext, BottomBar, ColonyOverlay.

export const COSMIC = {
  TOP_BAR_H:     46,   // pasek zasobów + czas (góra)
  MAP_MODE_H:    0,    // MapModeBar usunięty — overlaye zajmują tę przestrzeń
  SUBNAV_H:      24,   // pas zakładek rodzeństwa grupy (nav 14→7) — pod TopBarem, tylko gdy aktywny overlay jest w grupie >1
  OUTLINER_W:    150,  // Slice 5 — węższy panel prawy (kompakt: tylko nazwy)
  BOTTOM_CTX_H:  120,  // kontekstowy panel dolny (info o encji)
  BOTTOM_BAR_H:  26,   // cienki pasek dolny (stabilność + EventLog + przyciski)
  RESOURCE_BAR_H: 0,   // dawny dolny pasek surowców usunięty (zastąpiony górnym TopResourceDrawer, hover-drawer); =0 → konsumenci (Outliner/BaseOverlay/BottomContext/CombatHUD) odzyskują tę przestrzeń
  CIV_PANEL_W:   280,  // szerokość rozwiniętego CivPanel
  CIV_SIDEBAR_W: 0,    // Slice 4 — pionowy sidebar usunięty (nav na górze); lewa krawędź = 0
};

export const GLOBE = {
  TOP_BAR_H:     50,   // pasek zasobów + "Wróć" (góra)
  LEFT_W:        240,  // lewy panel (CivPanel + budynki)
  RIGHT_W:       220,  // prawy panel (budowanie + złoża)
  BOTTOM_BAR_H:  44,   // dolny pasek (teren + siatka + czas)
};
