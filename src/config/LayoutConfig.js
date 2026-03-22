// LayoutConfig — stałe wymiarów paneli UI
//
// Dwa layouty: COSMIC (widok kosmiczny) i GLOBE (widok globusa planety).
// Importowane przez UIManager, TopBar, Outliner, BottomContext, BottomBar, ColonyOverlay.

export const COSMIC = {
  TOP_BAR_H:     46,   // pasek zasobów + czas (góra)
  MAP_MODE_H:    30,   // wysokość paska MapModeBar + margines pod TopBar
  OUTLINER_W:    170,  // panel prawy (kolonie/ekspedycje/flota)
  BOTTOM_CTX_H:  120,  // kontekstowy panel dolny (info o encji)
  BOTTOM_BAR_H:  26,   // cienki pasek dolny (stabilność + EventLog + przyciski)
  CIV_PANEL_W:   280,  // szerokość rozwiniętego CivPanel
  CIV_SIDEBAR_W: 30,   // szerokość paska ikon CivPanel
};

export const GLOBE = {
  TOP_BAR_H:     50,   // pasek zasobów + "Wróć" (góra)
  LEFT_W:        240,  // lewy panel (CivPanel + budynki)
  RIGHT_W:       220,  // prawy panel (budowanie + złoża)
  BOTTOM_BAR_H:  44,   // dolny pasek (teren + siatka + czas)
};
