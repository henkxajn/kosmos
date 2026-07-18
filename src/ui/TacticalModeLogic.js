// TacticalModeLogic — CZYSTA logika trybu taktycznego (Obraz Operacyjny, Faza 2).
// Node-importowalna (zero THREE/canvas/window) — testowalna headless. Definiuje,
// CO tryb zapisuje przy wejściu i CO przywraca przy wyjściu; orkiestracja
// (kamera, eventy, re-sync warstw) w TacticalModeController.js.

// Preset top-down: phi≈0.1 to niemal pion (0 = degeneracja lookAt — Aneks A.4);
// 0.12 daje minimalny skos, przy którym orbity nie spłaszczają się do linii.
export const TACTICAL_PHI = 0.12;

/**
 * Plan WEJŚCIA w tryb: snapshot stanu do przywrócenia + wartości do zastosowania.
 * @param {object} src — { camera: snapshotView(), sensorOverlayVisible: bool, frameDist: number }
 * @returns {{snapshot: {camera, sensorOverlayVisible}, apply: {camera, sensorOverlayVisible}}}
 */
export function buildTacticalEnterPlan(src = {}) {
  const cam = src.camera ?? null;
  return {
    snapshot: {
      camera: cam,
      sensorOverlayVisible: src.sensorOverlayVisible === true,
    },
    apply: {
      camera: {
        theta:  cam?.theta ?? 0.3,           // azymut bez zmian — mniejsza dezorientacja
        phi:    TACTICAL_PHI,                 // top-down
        dist:   Number.isFinite(src.frameDist) ? src.frameDist : (cam?.dist ?? 85),
        target: { x: 0, y: 0, z: 0 },         // środek układu (stół sztabowy)
      },
      sensorOverlayVisible: true,             // wymuszona warstwa sensorów
    },
  };
}

/**
 * Plan WYJŚCIA — przywraca DOKŁADNIE stan sprzed wejścia (wymóg twardy).
 * @param {object} snapshot — snapshot z buildTacticalEnterPlan
 */
export function buildTacticalExitPlan(snapshot = {}) {
  return {
    camera: snapshot.camera ?? null,
    sensorOverlayVisible: snapshot.sensorOverlayVisible === true,
  };
}
