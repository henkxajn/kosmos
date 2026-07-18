// TacticalModeController — orkiestrator trybu taktycznego (Obraz Operacyjny, Faza 2).
// „Stół sztabowy" na żywej mapie 3D: preset kamery top-down (lerp z 2a), wymuszone
// warstwy z JAWNYM re-synciem (sensor ringi są event-driven — sama zmiana flagi nie
// wystarcza), pełny restore kamery i uiPrefs przy wyjściu. Tryb zmienia WIDOK,
// nigdy sposób dowodzenia (selekcja/PPM/rozkazy — te same kanały co poza trybem).
//
// Wejście/wyjście: klawisz Y (GameScene, gate civMode + FEATURES.tacticalMode);
// auto-exit przy otwarciu dowolnego overlaya (autoExitIfOverlay per-frame z draw
// UIManagera). Flaga OFF → enter() no-op (zero kosztów: jeden boolean).

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { buildTacticalEnterPlan, buildTacticalExitPlan } from './TacticalModeLogic.js';

export class TacticalModeController {
  constructor() {
    this._active = false;
    this._snapshot = null;   // stan sprzed wejścia (kamera + uiPrefs) — restore 1:1
  }

  get isActive() { return this._active; }

  toggle() { this._active ? this.exit('key') : this.enter(); }

  enter() {
    if (this._active) return;
    if (GAME_CONFIG.FEATURES?.tacticalMode !== true) return;
    const K = window.KOSMOS;
    const cam = K?.threeRenderer?._cameraController;
    if (!cam?.snapshotView) return;

    const plan = buildTacticalEnterPlan({
      camera: cam.snapshotView(),
      sensorOverlayVisible: K?.uiPrefs?.sensorOverlayVisible === true,
      frameDist: cam._defaultDist,
    });
    this._snapshot = plan.snapshot;
    this._active = true;

    cam.flyTo(plan.apply.camera);
    this._applyLayerState(plan.apply.sensorOverlayVisible);
    EventBus.emit('tactical:modeChanged', { active: true });
    if (K?.uiManager) K.uiManager._dirty = true;
  }

  exit(reason = 'manual') {
    if (!this._active) return;
    const K = window.KOSMOS;
    const cam = K?.threeRenderer?._cameraController;
    const plan = buildTacticalExitPlan(this._snapshot);
    this._active = false;
    this._snapshot = null;

    if (cam?.flyTo && plan.camera) cam.flyTo(plan.camera);
    this._applyLayerState(plan.sensorOverlayVisible);
    EventBus.emit('tactical:modeChanged', { active: false, reason });
    if (K?.uiManager) K.uiManager._dirty = true;
  }

  /** Auto-exit przy otwartym overlayu — wołane per-frame z draw UIManagera. */
  autoExitIfOverlay(overlayManager) {
    if (this._active && overlayManager?.isAnyOpen?.()) this.exit('overlay');
  }

  // Wymuszenie/restore warstw = flaga + JAWNY re-sync (warstwy event-driven):
  // sensor ringi reagują na ui:sensorOverlayToggle; prediction cones dociągamy
  // bezpośrednim _syncPredictionCones() (inaczej czekałyby na tick pozycji).
  // Linie rozkazów NIE są warstwą przełączalną (pieczone per-statek) — nic nie robimy.
  _applyLayerState(sensorVisible) {
    const K = window.KOSMOS;
    if (K?.uiPrefs) K.uiPrefs.sensorOverlayVisible = sensorVisible;
    EventBus.emit('ui:sensorOverlayToggle', { visible: sensorVisible });
    K?.threeRenderer?._syncPredictionCones?.();
    // Warstwa nawigacyjna (2g — zamiast dimu): wyraźne orbity + siatka; restore przy wyjściu.
    K?.threeRenderer?.setTacticalStyle?.(this._active);
    // Glify/duchy (2c/2d): jawny sync — enter tworzy, exit sprząta NATYCHMIAST
    // (bez czekania na klatkę renderu; przysłonięte okno wstrzymuje RAF).
    K?.threeRenderer?._syncTacticalGlyphs?.();
  }
}
