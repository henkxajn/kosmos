// Kontroler kamery Three.js — sferyczny orbit jak w space_4x_prototype.html
// Zdarzenia nasłuchiwane na WINDOW (gwarantuje odbiór na każdej konfiguracji)
// LPM drag = obrót | scroll = zoom | H = reset

import * as THREE from 'three';
import { gameplayToWorld } from '../utils/CoordTransform.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

const DRAG_THRESHOLD = 5;  // px — poniżej = kliknięcie, powyżej = orbit

// Skala 3D ↔ tactical — dystans kamery przypadający na 1 AU promienia układu przy
// ramce startowej. Dobrane empirycznie (FOV 55°, oblique tilt) tak, by cały układ
// mieścił się w kadrze jak fit-to-bounds mapy taktycznej. Tunable: większe = dalej
// (ciaśniej/bardziej kompaktowo na ekranie), mniejsze = bliżej (rozleglej).
const SYSTEM_FIT_DIST_PER_AU = 20;

export class ThreeCameraController {
  constructor(camera) {
    this.camera = camera;

    this._theta      = 0.3;
    this._phi        = 1.1;
    // Faza 2 (tryb taktyczny) — animowane kąty: null = brak animacji; lerp w update().
    // Drag gracza PRZERYWA animację (nie blokujemy sterowania — wymóg A.4).
    this._goalTheta  = null;
    this._goalPhi    = null;
    // Ramka startowa — nadpisywana przez frameSystem() wg zasięgu układu (skala 3D ↔ tactical)
    this._defaultDist = 85;
    this._dist       = this._defaultDist;
    this._targetDist = this._defaultDist;
    this._target     = new THREE.Vector3(0, 0, 0);
    this._goalTarget = new THREE.Vector3(0, 0, 0); // cel docelowy (lerp)

    this._isDragging = false;
    this._hasMoved   = false;
    this._startX     = 0;
    this._startY     = 0;
    this._lastX      = 0;
    this._lastY      = 0;

    // Dynamiczny min zoom — mniejszy gdy focus na księżycu
    this._minDist    = 0.3;    // domyślny min zoom (jednostki Three.js)

    // Callback: (clientX, clientY) => bool — blokuje kamerę gdy kursor nad UI
    this._isOverUI = null;

    // B1 (W2.1): epoka ruchu kamery — inkrementowana w update() gdy pozycja kamery FAKTYCZNIE
    // się zmienia (drag / zoom-lerp / pan-lerp / follow / frameSystem). UIManager czyta ją w
    // pętli rysowania i odświeża overlay 2D (etykiety mapy + ramki selekcji) co klatkę, dopóki
    // kamera się rusza — inaczej overlay dogania dopiero na timeDirty (10fps) lub ruch myszy.
    this._moveEpoch  = 0;
    this._lastCamPos = new THREE.Vector3();

    this._setup();
    this._applyCamera();
    this._lastCamPos.copy(this.camera.position);   // snapshot startowy (nie liczy się jako ruch)
  }

  _setup() {
    // Wszystkie zdarzenia na window — nie zależy od z-index warstw
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Slice 8 — SHIFT+LPM zarezerwowane na box-select (GameScene); kamera nie orbituje.
      if (e.shiftKey && GAME_CONFIG.FEATURES?.fcMultiSelect) return;
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
        // Wejście gracza przerywa animację kątów (tryb taktyczny nie blokuje sterowania).
        this._goalTheta = null;
        this._goalPhi   = null;
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
      // Blokuj zoom gdy overlay jest otwarty (scroll obsługuje UIManager)
      if (window.KOSMOS?.overlayManager?.isAnyOpen()) return;
      // Blokuj zoom gdy kursor jest nad elementem UI
      if (this._isOverUI && this._isOverUI(e.clientX, e.clientY)) return;
      // Adaptacyjna czułość: wolniej przy bliskim zoomie → precyzja.
      // Fix#5: drobniejsze kroki w zakresie statku (0.05–0.6) → łatwiej trafić pośredni zoom.
      const zoomSpeed = this._targetDist < 0.15 ? 0.0006
                      : this._targetDist < 0.6  ? 0.0012
                      : this._targetDist < 2    ? 0.004
                      : this._targetDist < 5    ? 0.01
                      : this._targetDist < 20   ? 0.02 : 0.05;
      this._targetDist = Math.max(this._minDist, Math.min(450, this._targetDist + e.deltaY * zoomSpeed));
    }, { passive: false });
  }

  update() {
    // Faza 2 — lerp kątów (jedyna animacja _theta/_phi w kontrolerze; snap przy zbieżności).
    if (this._goalTheta !== null) {
      this._theta += (this._goalTheta - this._theta) * 0.12;
      if (Math.abs(this._goalTheta - this._theta) < 0.002) { this._theta = this._goalTheta; this._goalTheta = null; }
    }
    if (this._goalPhi !== null) {
      this._phi += (this._goalPhi - this._phi) * 0.12;
      if (Math.abs(this._goalPhi - this._phi) < 0.002) { this._phi = this._goalPhi; this._goalPhi = null; }
    }
    this._dist += (this._targetDist - this._dist) * 0.08;
    // Płynne przesuwanie celu kamery (śledzenie planety/księżyca)
    this._target.lerp(this._goalTarget, 0.08);
    // Odzyskaj stan po propagacji NaN (zapobiega trwałemu białemu ekranowi)
    if (isNaN(this._target.x) || isNaN(this._target.z)) {
      this._target.set(0, 0, 0);
      this._goalTarget.set(0, 0, 0);
      this._dist = this._targetDist = this._defaultDist;
    }
    this._applyCamera();
    // B1 (W2.1): wykryj realną zmianę pozycji kamery → bump epoki (overlay 2D dogania co klatkę).
    // Próg odl.² > 1e-8 (≈1e-4 liniowo): poniżej = wizualnie osiadło (sub-piksel) → epoka zamiera,
    // overlay wraca do trybu dirty/idle (bez wiecznego przerysowywania).
    if (this._lastCamPos.distanceToSquared(this.camera.position) > 1e-8) {
      this._lastCamPos.copy(this.camera.position);
      this._moveEpoch++;
    }
  }

  _applyCamera() {
    const d = this._dist, p = this._phi, t = this._theta;
    const x = this._target.x + d * Math.sin(p) * Math.cos(t);
    const y = this._target.y + d * Math.cos(p);
    const z = this._target.z + d * Math.sin(p) * Math.sin(t);
    // Guard NaN — zapobiega białemu/czarnemu ekranowi
    if (isNaN(x) || isNaN(y) || isNaN(z)) return;
    if (isNaN(this._target.x) || isNaN(this._target.z)) return;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this._target);
  }

  resetToCenter() {
    this._theta = 0.3; this._phi = 1.1; this._targetDist = this._defaultDist;
    this._goalTarget.set(0, 0, 0);
  }

  // Skala 3D ↔ tactical — ramka startowa: dopasuj dystans kamery tak, by cały układ
  // (promień maxOrbitAU w AU) zmieścił się w kadrze, jak fit-to-bounds mapy taktycznej.
  // Ustawia też _defaultDist → reset (H) wraca do tej ramki, nie do sztywnego 85.
  frameSystem(maxOrbitAU) {
    if (!Number.isFinite(maxOrbitAU) || maxOrbitAU <= 0) return;
    const fit = Math.max(70, Math.min(450, maxOrbitAU * SYSTEM_FIT_DIST_PER_AU));
    this._defaultDist = fit;
    this._dist = this._targetDist = fit;  // snap bez lerpa — start / zmiana układu
    this._theta = 0.3;
    this._phi   = 1.1;
    this._goalTarget.set(0, 0, 0);
    this._target.set(0, 0, 0);
  }

  // Ustaw docelowy punkt kamery (płynny lerp w update)
  focusOn(worldX, worldZ) {
    if (isNaN(worldX) || isNaN(worldZ)) return; // guard NaN → biały ekran
    this._goalTarget.set(worldX, 0, worldZ);
  }

  // Natychmiastowe ustawienie celu kamery (bez lerpa) — do śledzenia statków
  focusOnInstant(worldX, worldZ, worldY = 0) {
    if (isNaN(worldX) || isNaN(worldZ)) return;
    this._goalTarget.set(worldX, worldY, worldZ);
    this._target.set(worldX, worldY, worldZ);
  }

  // Szybkie śledzenie celu (wygładzone) — eliminuje drganie float32
  focusOnSmooth(worldX, worldZ, worldY = 0) {
    if (isNaN(worldX) || isNaN(worldZ)) return;
    this._goalTarget.set(worldX, worldY, worldZ);
    // Szybki lerp — nadąża za ruchem ale wygładza mikro-drgania GPU
    this._target.lerp(this._goalTarget, 0.4);
  }

  // M3 P2.3 — focus na punkt w gameplay coords (px from origin).
  // Konwertuje przez CoordTransform → focusOn (Three.js world coords).
  // Single source of truth dla coord conversion (resolves issue #5).
  focusOnGameplayCoord(gameplayPoint) {
    const world = gameplayToWorld(gameplayPoint);
    if (!world) return;
    this.focusOn(world.worldX, world.worldZ);
  }

  // Ustaw minimalny dystans kamery (np. 0.5 dla księżyców, 3 domyślnie)
  setMinDist(val) { this._minDist = val; }

  // Ustaw docelowy dystans kamery (auto-zoom, płynny lerp w update)
  setTargetDist(dist) {
    this._targetDist = Math.max(this._minDist, Math.min(450, dist));
  }

  get wasDrag()    { return this._hasMoved; }
  get isDragging() { return this._isDragging; }
  get moveEpoch()  { return this._moveEpoch; }   // B1 (W2.1): rośnie gdy kamera się rusza

  // ── Faza 2 (tryb taktyczny) — snapshot/restore + płynny przelot ──────────

  /** Pełny stan widoku (kąty + dystans + cel) — do restore przy wyjściu z trybu. */
  snapshotView() {
    return {
      theta: this._theta,
      phi:   this._phi,
      dist:  this._targetDist,
      target: { x: this._goalTarget.x, y: this._goalTarget.y, z: this._goalTarget.z },
    };
  }

  /**
   * Płynny przelot do zadanego widoku (kąty przez lerp w update(), dist/target
   * istniejącymi lerpami). Lerp zbiega DOKŁADNIE do celu (snap przy progu) —
   * restore snapshotu przywraca kamerę 1:1. Drag gracza przerywa kąty.
   */
  flyTo({ theta, phi, dist, target } = {}) {
    if (Number.isFinite(theta)) this._goalTheta = theta;
    if (Number.isFinite(phi))   this._goalPhi = Math.max(0.1, Math.min(Math.PI * 0.9, phi));
    if (Number.isFinite(dist))  this.setTargetDist(dist);
    if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
      this._goalTarget.set(target.x, target.y ?? 0, target.z);
    }
  }
}
