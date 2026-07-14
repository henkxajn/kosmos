// FloatingPanel — lekki helper okna pływającego (S3.4b). KOMPOZYCJA (nie dziedziczenie):
// panel (BottomContext / StationPanel) trzyma instancję i deleguje pozycję + przeciąganie za
// nagłówek. Dokowanie (pasek zadań w lewym-dolnym rogu) obsługuje osobny PanelDock; tu tylko
// stan draga + flaga `minimized`.
//
// Model pozycji: `dragPos` = ręcznie narzucony lewy-górny róg. null → panel podąża za kotwicą
// (ekranowa pozycja ciała/stacji). Po przeciągnięciu okno ODCZEPIA się od kotwicy i stoi w
// miejscu (decyzja Filipa S3.4b: panel nieruchomy przy ruchu kamery, do zamknięcia/restore).
// Pozycja NIE jest serializowana — reset po nowej sesji (świadoma decyzja).

const DRAG_THRESHOLD = 4;   // px — poniżej = klik (NIE odczepiaj od kotwicy)

export class FloatingPanel {
  constructor() {
    this.dragPos   = null;    // {x,y} narzucony lewy-górny róg | null = kotwica
    this.minimized = false;   // C2 — true = panel schowany, belka w PanelDock
    this._dragging = false;
    this._moved    = false;   // przekroczono próg → to realny drag, nie klik
    this._grabDX   = 0;       // offset chwytu od lewego-górnego rogu panelu
    this._grabDY   = 0;
    this._startX   = 0;
    this._startY   = 0;
  }

  /** Finalna pozycja panelu: narzucona (drag) albo kotwica; zawsze clamp do bounds mapy. */
  place(anchorPx, anchorPy, pw, ph, b) {
    const px = this.dragPos ? this.dragPos.x : anchorPx;
    const py = this.dragPos ? this.dragPos.y : anchorPy;
    return this._clamp(px, py, pw, ph, b);
  }

  /** Clamp lewego-górnego rogu tak, by cały panel mieścił się w obszarze mapy (b = {ox,oy,ow,oh}). */
  _clamp(px, py, pw, ph, b) {
    const minX = b.ox + 4, maxX = Math.max(minX, b.ox + b.ow - pw - 4);
    const minY = b.oy + 4, maxY = Math.max(minY, b.oy + b.oh - ph - 4);
    return {
      px: Math.max(minX, Math.min(maxX, px)),
      py: Math.max(minY, Math.min(maxY, py)),
    };
  }

  /** Rozpocznij drag (panel sam sprawdza, że klik trafił w pas nagłówka, POZA przyciskami). */
  beginDrag(mx, my, panelPx, panelPy) {
    this._dragging = true;
    this._moved    = false;
    this._startX   = mx;
    this._startY   = my;
    this._grabDX   = mx - panelPx;
    this._grabDY   = my - panelPy;
  }

  /** Aktualizuj drag; ustawia dragPos dopiero po przekroczeniu progu. Zwraca true gdy przesunięto. */
  updateDrag(mx, my, pw, ph, b) {
    if (!this._dragging) return false;
    if (!this._moved) {
      const dx = mx - this._startX, dy = my - this._startY;
      if (Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return false;
      this._moved = true;
    }
    const c = this._clamp(mx - this._grabDX, my - this._grabDY, pw, ph, b);
    this.dragPos = { x: c.px, y: c.py };
    return true;
  }

  /** Zakończ drag. Zwraca true gdy to był realny drag (nie klik) — panel może pochłonąć klik. */
  endDrag() {
    const moved = this._moved;
    this._dragging = false;
    this._moved = false;
    return moved;
  }

  isDragging() { return this._dragging; }

  /** Odczep/reset do kotwicy (np. przy zmianie zaznaczonej encji). */
  reanchor() { this.dragPos = null; }
}
