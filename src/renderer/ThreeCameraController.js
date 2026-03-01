// Kontroler kamery Three.js — sferyczny orbit jak w space_4x_prototype.html
// Zdarzenia nasłuchiwane na WINDOW (gwarantuje odbiór na każdej konfiguracji)
// LPM drag = obrót | scroll = zoom | H = reset

import * as THREE from 'three';

const DRAG_THRESHOLD = 5;  // px — poniżej = kliknięcie, powyżej = orbit

export class ThreeCameraController {
  constructor(camera) {
    this.camera = camera;

    this._theta      = 0.3;
    this._phi        = 1.1;
    this._dist       = 85;
    this._targetDist = 85;
    this._target     = new THREE.Vector3(0, 0, 0);
    this._goalTarget = new THREE.Vector3(0, 0, 0); // cel docelowy (lerp)

    this._isDragging = false;
    this._hasMoved   = false;
    this._startX     = 0;
    this._startY     = 0;
    this._lastX      = 0;
    this._lastY      = 0;

    // Dynamiczny min zoom — mniejszy gdy focus na księżycu
    this._minDist    = 3;      // domyślny min zoom (jednostki Three.js)

    // Callback: (clientX, clientY) => bool — blokuje kamerę gdy kursor nad UI
    this._isOverUI = null;

    this._setup();
    this._applyCamera();
  }

  _setup() {
    // Wszystkie zdarzenia na window — nie zależy od z-index warstw
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Blokuj kamerę gdy kursor jest nad elementem UI
      if (this._isOverUI && this._isOverUI(e.clientX, e.clientY)) return;
      this._isDragging = true;
      this._hasMoved   = false;
      this._startX = this._lastX = e.clientX;
      this._startY = this._lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      const tdx = e.clientX - this._startX;
      const tdy = e.clientY - this._startY;
      if (!this._hasMoved && Math.sqrt(tdx*tdx + tdy*tdy) > DRAG_THRESHOLD) {
        this._hasMoved = true;
      }
      if (this._hasMoved) {
        this._theta -= dx * 0.005;
        this._phi    = Math.max(0.1, Math.min(Math.PI * 0.9, this._phi - dy * 0.005));
      }
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });

    window.addEventListener('mouseup', () => { this._isDragging = false; });

    // Zoom — na window, passive:false żeby móc preventDefault
    // max 450 = widoczność orbit do ~40 AU (dla układów 9-11 planet)
    window.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Blokuj zoom gdy kursor jest nad elementem UI
      if (this._isOverUI && this._isOverUI(e.clientX, e.clientY)) return;
      // Adaptacyjna czułość: wolniej przy bliskim zoomie → precyzja
      const zoomSpeed = this._targetDist < 5 ? 0.01
                      : this._targetDist < 20 ? 0.02 : 0.05;
      this._targetDist = Math.max(this._minDist, Math.min(450, this._targetDist + e.deltaY * zoomSpeed));
    }, { passive: false });
  }

  update() {
    this._dist += (this._targetDist - this._dist) * 0.08;
    // Płynne przesuwanie celu kamery (śledzenie planety/księżyca)
    this._target.lerp(this._goalTarget, 0.08);
    this._applyCamera();
  }

  _applyCamera() {
    const d = this._dist, p = this._phi, t = this._theta;
    this.camera.position.set(
      this._target.x + d * Math.sin(p) * Math.cos(t),
      this._target.y + d * Math.cos(p),
      this._target.z + d * Math.sin(p) * Math.sin(t),
    );
    this.camera.lookAt(this._target);
  }

  resetToCenter() {
    this._theta = 0.3; this._phi = 1.1; this._targetDist = 85;
    this._goalTarget.set(0, 0, 0);
  }

  // Ustaw docelowy punkt kamery (płynny lerp w update)
  focusOn(worldX, worldZ) { this._goalTarget.set(worldX, 0, worldZ); }

  // Ustaw minimalny dystans kamery (np. 0.5 dla księżyców, 3 domyślnie)
  setMinDist(val) { this._minDist = val; }

  get wasDrag()    { return this._hasMoved; }
  get isDragging() { return this._isDragging; }
}
