// PlanetGlobeCameraController — kontroler kamery orbitującej wokół planety
//
// Sferyczny orbit: LMB drag = obrót (yaw/pitch), scroll = zoom.
// Dwa tryby:
//   1. attach(container) — eventy podpinane bezpośrednio do canvasa globu
//   2. External input    — PlanetGlobeScene przekazuje drag/zoom z event-layer
//      Metody: applyDrag(dx,dy), applyZoom(deltaY), startDrag(), endDrag()

export class PlanetGlobeCameraController {
  constructor(camera) {
    this.camera = camera;

    this._yaw       = 0;      // obrót poziomy (radiany)
    this._pitch     = 0.3;    // obrót pionowy (radiany)
    this._dist      = 3.0;    // aktualna odległość od centrum
    this._targetDist = 3.0;   // docelowa odległość (smooth lerp)

    this._isDragging  = false;
    this._lastX       = 0;
    this._lastY       = 0;
    this._dragStartX  = 0;    // pozycja przy mousedown (do detekcji drag vs klik)
    this._dragStartY  = 0;
    this.wasDrag      = false; // true jeśli ostatni mouseup był po dragu (>5px)

    // Referencja do kontenera DOM (ustawiana przez attach)
    this._container = null;

    // Bound handlery (do usunięcia przy dispose)
    this._onMouseDown = null;
    this._onMouseMove = null;
    this._onMouseUp   = null;
    this._onWheel     = null;
  }

  // ── Tryb 1: eventy na kontenerze DOM ──────────────────────────

  // Podłącz eventy do kontenera DOM (canvas globu)
  attach(container) {
    this._container = container;

    this._onMouseDown = (e) => {
      if (e.button !== 0) return; // tylko LMB
      this._isDragging  = true;
      this._lastX       = e.clientX;
      this._lastY       = e.clientY;
      this._dragStartX  = e.clientX;
      this._dragStartY  = e.clientY;
      this.wasDrag      = false;
    };

    this._onMouseMove = (e) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._yaw   += dx * 0.005;
      this._pitch  = Math.max(-1.3, Math.min(1.3, this._pitch - dy * 0.005));
      this._lastX  = e.clientX;
      this._lastY  = e.clientY;
    };

    this._onMouseUp = (e) => {
      const totalDx = Math.abs((e?.clientX ?? this._lastX) - this._dragStartX);
      const totalDy = Math.abs((e?.clientY ?? this._lastY) - this._dragStartY);
      this.wasDrag = (totalDx + totalDy) > 5;
      this._isDragging = false;
    };

    this._onWheel = (e) => {
      e.preventDefault();
      this._targetDist = Math.max(1.5, Math.min(8.0, this._targetDist + e.deltaY * 0.003));
    };

    container.addEventListener('mousedown', this._onMouseDown);
    container.addEventListener('mousemove', this._onMouseMove);
    container.addEventListener('mouseup',   this._onMouseUp);
    container.addEventListener('wheel',     this._onWheel, { passive: false });
  }

  // ── Tryb 2: external input (PlanetGlobeScene steruje z event-layer) ──

  startDrag(clientX, clientY) {
    this._isDragging  = true;
    this._lastX       = clientX;
    this._lastY       = clientY;
    this._dragStartX  = clientX;
    this._dragStartY  = clientY;
    this.wasDrag      = false;
  }

  applyDrag(clientX, clientY) {
    if (!this._isDragging) return;
    const dx = clientX - this._lastX;
    const dy = clientY - this._lastY;
    this._yaw   += dx * 0.005;
    this._pitch  = Math.max(-1.3, Math.min(1.3, this._pitch - dy * 0.005));
    this._lastX  = clientX;
    this._lastY  = clientY;
  }

  endDrag(clientX, clientY) {
    const totalDx = Math.abs((clientX ?? this._lastX) - this._dragStartX);
    const totalDy = Math.abs((clientY ?? this._lastY) - this._dragStartY);
    this.wasDrag = (totalDx + totalDy) > 5;
    this._isDragging = false;
  }

  applyZoom(deltaY) {
    this._targetDist = Math.max(1.5, Math.min(8.0, this._targetDist + deltaY * 0.003));
  }

  // Aktualizuj pozycję kamery (wywoływane co klatkę)
  update() {
    // Płynny zoom
    this._dist += (this._targetDist - this._dist) * 0.1;

    // Sferyczne → kartezjańskie
    const d = this._dist;
    const p = this._pitch;
    const y = this._yaw;

    this.camera.position.set(
      d * Math.cos(p) * Math.sin(y),
      d * Math.sin(p),
      d * Math.cos(p) * Math.cos(y),
    );
    this.camera.lookAt(0, 0, 0);
  }

  // Odłącz eventy i wyczyść referencje
  dispose() {
    if (this._container) {
      this._container.removeEventListener('mousedown', this._onMouseDown);
      this._container.removeEventListener('mousemove', this._onMouseMove);
      this._container.removeEventListener('mouseup',   this._onMouseUp);
      this._container.removeEventListener('wheel',     this._onWheel);
    }
    this._container = null;
  }
}
