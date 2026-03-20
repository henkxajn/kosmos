// OverlayManager — zarządza panelami overlay (jeden aktywny naraz)
//
// Rejestruje overlay'e po ID, obsługuje toggle klawiaturą (F/P/E/T),
// Escape zamyka aktywny panel. Deleguje draw/click/move do aktywnego overlay.
// Wspiera zarówno BaseOverlay (show/hide) jak i FleetManagerOverlay (open/close).

export class OverlayManager {
  constructor() {
    this.overlays = {}; // id → overlay instance
    this.active = null; // aktualnie widoczny id
    this._keyMap = {
      'f': 'fleet',
      'p': 'population',
      'e': 'economy',
      't': 'tech',
      'c': 'colony',
      'o': 'observatory',
      'g': 'galaxy',
    };
  }

  register(id, overlay) {
    this.overlays[id] = overlay;
  }

  // ── Wewnętrzne — otwórz/zamknij overlay niezależnie od API ─────────
  _showOverlay(ov) {
    if (ov.show) ov.show();
    else if (ov.open) ov.open();
  }

  _hideOverlay(ov) {
    if (ov.hide) ov.hide();
    else if (ov.close) ov.close();
  }

  // Zwraca true jeśli klawisz obsłużony
  handleKey(key) {
    const id = this._keyMap[key.toLowerCase()];
    if (!id) return false;
    if (!this.overlays[id]) {
      console.log(`Panel ${id}: not yet registered`);
      return false;
    }
    if (this.active === id) {
      this._hideOverlay(this.overlays[id]);
      this.active = null;
    } else {
      if (this.active) this._hideOverlay(this.overlays[this.active]);
      this._showOverlay(this.overlays[id]);
      this.active = id;
    }
    return true;
  }

  openPanel(id) {
    if (!this.overlays[id]) return;
    if (this.active && this.active !== id) this._hideOverlay(this.overlays[this.active]);
    this._showOverlay(this.overlays[id]);
    this.active = id;
  }

  closeActive() {
    if (this.active) {
      this._hideOverlay(this.overlays[this.active]);
      this.active = null;
    }
  }

  isAnyOpen() { return this.active !== null; }

  draw(ctx, W, H) {
    if (!this.active) return;
    const ov = this.overlays[this.active];
    // Synchronizuj — overlay mógł się zamknąć wewnętrznie (np. przycisk [X])
    const isVis = ov.visible ?? ov.isVisible ?? ov._visible;
    if (!isVis) { this.active = null; return; }
    ov.draw(ctx, W, H);
  }

  handleClick(x, y) {
    if (!this.active) return false;
    return this.overlays[this.active].handleClick(x, y);
  }

  handleMouseMove(x, y) {
    if (!this.active) return;
    this.overlays[this.active].handleMouseMove(x, y);
  }

  handleScroll(delta, x, y) {
    if (!this.active) return false;
    const ov = this.overlays[this.active];
    if (ov.handleScroll) return ov.handleScroll(delta, x, y);
    return false;
  }

  handleMouseDown(x, y) {
    if (!this.active) return;
    const ov = this.overlays[this.active];
    if (ov.handleMouseDown) ov.handleMouseDown(x, y);
  }

  handleMouseUp(x, y) {
    if (!this.active) return;
    const ov = this.overlays[this.active];
    if (ov.handleMouseUp) ov.handleMouseUp(x, y);
  }
}
