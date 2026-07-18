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

// ── Slice 2g — wskaźniki ruchu ciał (warstwa nawigacyjna zamiast dimu) ───────
// Czysta geometria: orbita + rok → pozycja znacznika. Łańcuch IDENTYCZNY jak
// PhysicsSystem._updateOrbit (updateMeanAnomaly → solveKepler → trueAnomaly →
// orbitalRadius → obrót o inclinationOffset) — jedno źródło mechaniki orbit.

import { KeplerMath } from '../utils/KeplerMath.js';

/**
 * Pozycja ciała na orbicie po deltaYears (px gameplay, rama gwiazdy w starX/Y).
 * @param {object} orbital — { a, e, T, M, inclinationOffset } (komponent orbital ciała)
 * @param {number} deltaYears — ile lat w przód (0 = teraz)
 * @param {number} auToPx — GAME_CONFIG.AU_TO_PX
 * @returns {{x:number, y:number}|null} null gdy orbital niekompletny
 */
export function orbitalPositionAtDelta(orbital, deltaYears, auToPx, starX = 0, starY = 0) {
  if (!orbital || !Number.isFinite(orbital.a) || !Number.isFinite(orbital.T)
      || orbital.T <= 0 || !Number.isFinite(auToPx)) return null;
  const e = orbital.e ?? 0;
  const M = KeplerMath.updateMeanAnomaly(orbital.M ?? 0, deltaYears, orbital.T);
  const E = KeplerMath.solveKepler(M, e);
  const theta = KeplerMath.eccentricToTrueAnomaly(E, e);
  const r = KeplerMath.orbitalRadius(orbital.a, e, theta);
  const angle = theta + (orbital.inclinationOffset ?? 0);
  return { x: starX + r * Math.cos(angle) * auToPx, y: starY + r * Math.sin(angle) * auToPx };
}

// „Ładne" kroki czasowe znaczników (lata) — od szybkich skalnych po gazowe olbrzymy.
const NICE_STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];

/**
 * Adaptacyjne delty znaczników przyszłych pozycji: krok ≈ 1/8 okresu zaokrąglony
 * do „ładnego" (wolne olbrzymy NIE dostają tików co 2°, szybkie skalne nie co 720°).
 * 2h: adaptacja także względem ZOOMU kamery — stepMult rozrzedza tiki przy dalekim
 * kadrze (mniej znaczników, większy odstęp kątowy), count zagęszcza przy bliskim.
 * @param {number} periodYears — okres orbitalny T (lata)
 * @param {number} [count=2] — liczba znaczników
 * @param {number} [stepMult=1] — mnożnik kroku (2 = co drugi „ładny" krok)
 * @returns {Array<{dt:number, label:string}>} np. [{dt:1,label:'+1'},{dt:2,label:'+2'}]
 */
export function futureMarkerDeltas(periodYears, count = 2, stepMult = 1) {
  if (!Number.isFinite(periodYears) || periodYears <= 0) return [];
  const raw = (periodYears / 8) * Math.max(1, stepMult);
  const step = NICE_STEPS.find(s => s >= raw) ?? NICE_STEPS[NICE_STEPS.length - 1];
  const out = [];
  for (let i = 1; i <= count; i++) {
    const dt = step * i;
    out.push({ dt, label: `+${dt}` });
  }
  return out;
}
