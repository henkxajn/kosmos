// GalaxyGestureLogic — ARC GALAXY, krok G2-1 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-7, D-GX-13): CZYSTA logika GESTU
// semantycznego zoomu (kółko za klamrą zakresu kamery) i reguła CELU NURKOWANIA w układ.
//   • GEST (D-GX-7): liczymy SKUMULOWANE, ZNORMALIZOWANE px kółka za klamrą, nie zdarzenia (trackpad wysyła dziesiątki
//     drobnych `deltaY` na jeden ruch — licznik zdarzeń strzelałby od muśnięcia):
//       – UZBROJENIE: `_targetDist === maxDist` (tryb układu; w trybie galaktyki — podłoga `minDist`) I kamera osiadła
//         (`|dist − klamra| < SETTLE_FRAC × klamra`); stan kamery czytany PRZED krokiem zoomu (wołający podaje stan sprzed
//         `wheelZoom`), więc ząbek, który DOCHODZI do klamry, nie liczy się (w chwili zdarzenia klamry jeszcze nie było);
//       – zdarzenie w kierunku klamry (od siebie przy suficie układu, do siebie przy podłodze galaktyki) dokłada swoje px
//         (tryb linii × `LINE_PX` = 33, strony × wysokość okna — normalizacja `GalaxyModeLogic.normalizedWheelPx`);
//         wyzwolenie przy sumie ≥ `TRIGGER_PX` (3 ząbki = 300 px; strojenie 1 — było 2 ząbki) w oknie przesuwnym
//         `WINDOW_MS` (600 ms);
//       – zdarzenie w przeciwną stronę albo wyjście z klamry (kamera nieuzbrojona) — RESET sumy;
//       – lot w toku połyka kółko (decyduje wołający — `GalaxyModeController.onWheel`).
//   • CEL NURKOWANIA (D-GX-13): gwiazda ZAZNACZONA (gdy da się wejść; zaznaczona, do której wejść się nie da — brak celu,
//     przypięcie mówi dlaczego), inaczej gwiazda, do której da się wejść, najbliższa celowi kamery na płycie w promieniu
//     `CAPTURE_LY` (3 ly, odległość PŁASKA w płaszczyźnie płyty), inaczej brak (kółko staje na podłodze). „Da się wejść” —
//     bramka G1 (`GalaxyModeLogic.isSystemEnterable`: wygenerowany ∧ (zbadany ∨ własna obecność)) — wołający podaje predykat.
//   • NAWIASY ⌜⌟ na celu nurkowania od DWÓCH ostatnich ząbków nad podłogą: `targetDist ≤ minDist / IN²` (IN = 0,89 — ten
//     sam mnożnik ząbka co zoom galaktyki).
// Czysty: bez `window`, bez three, bez DOM. Zegar (`now`, ms) podaje wołający.
import { GALAXY_ZOOM, normalizedWheelPx } from './GalaxyModeLogic.js';

export const GALAXY_GESTURE = Object.freeze({
  TRIGGER_PX: 300,       // 3 ząbki po 100 px znormalizowanych (strojenie 1: było 2 = 200 px)
  WINDOW_MS: 600,        // okno przesuwne sumy
  SETTLE_FRAC: 0.02,     // kamera osiadła: |dist − klamra| < 2 % klamry
  CAPTURE_LY: 3,         // promień wyboru celu nurkowania wokół celu kamery [ly, płasko]
  BRACKET_NOTCHES: 2,    // nawiasy celu od tylu ząbków nad podłogą
});

const near = (a, b, frac) => Number.isFinite(a) && Number.isFinite(b) && b > 0 && Math.abs(a - b) < frac * b;

/**
 * Czy kamera jest uzbrojona do gestu (stan PRZED krokiem zoomu).
 * @param {{ mode:'system'|'galaxy', targetDist:number, dist:number, minDist:number, maxDist:number }} cam
 * @returns {'out'|'in'|null} — 'out': sufit trybu układu (gest wylotu do galaktyki); 'in': podłoga galaktyki (nurkowanie)
 */
export function gestureArm(cam) {
  if (!cam) return null;
  if (cam.mode === 'galaxy') {
    return cam.targetDist === cam.minDist && near(cam.dist, cam.minDist, GALAXY_GESTURE.SETTLE_FRAC) ? 'in' : null;
  }
  return cam.targetDist === cam.maxDist && near(cam.dist, cam.maxDist, GALAXY_GESTURE.SETTLE_FRAC) ? 'out' : null;
}

/**
 * Pamięć gestu. `feed(ev, cam, now)` — zdarzenie kółka (`{ deltaY, deltaMode, viewportH }`) i stan kamery PRZED krokiem
 * zoomu; zwraca `{ trigger: 'out'|'in'|null, sum, armed }`. Po wyzwoleniu suma wraca do zera.
 */
export function makeSemanticZoom() {
  let events = [];          // [{ t, px }] — zdarzenia w kierunku klamry w bieżącym uzbrojeniu
  let armedDir = null;
  const reset = () => { events = []; };
  return {
    feed(ev, cam, now) {
      const t = Number.isFinite(now) ? now : 0;
      const arm = gestureArm(cam);
      const px = normalizedWheelPx(ev?.deltaY ?? 0, ev?.deltaMode ?? 0, ev?.viewportH ?? 800);
      if (!arm || arm !== armedDir) { reset(); armedDir = arm; }
      if (!arm) return { trigger: null, sum: 0, armed: null };
      // Kierunek ku klamrze: od siebie (deltaY > 0) przy suficie układu, do siebie (deltaY < 0) przy podłodze galaktyki.
      const toward = arm === 'out' ? px > 0 : px < 0;
      if (!toward || px === 0) { reset(); return { trigger: null, sum: 0, armed: arm }; }
      events.push({ t, px: Math.abs(px) });
      events = events.filter((e) => t - e.t <= GALAXY_GESTURE.WINDOW_MS && e.t <= t);
      const sum = events.reduce((s, e) => s + e.px, 0);
      if (sum >= GALAXY_GESTURE.TRIGGER_PX) { reset(); return { trigger: arm, sum, armed: arm }; }
      return { trigger: null, sum, armed: arm };
    },
    reset() { reset(); armedDir = null; },
    get sum() { return events.reduce((s, e) => s + e.px, 0); },
  };
}

/**
 * Cel nurkowania (D-GX-13).
 * @param {{ selectedId?:string|null, stars:Array<{id:string, x:number, z:number}>, target:{x:number, z:number},
 *   K?:number, enterable:(id:string)=>boolean, captureLy?:number }} p — `stars` i `target` w świecie [j.]; `K` — j. / ly
 * @returns {string|null}
 */
export function diveTarget({ selectedId = null, stars = [], target = { x: 0, z: 0 }, K = 200, enterable = () => false,
  captureLy = GALAXY_GESTURE.CAPTURE_LY } = {}) {
  if (selectedId != null) return enterable(String(selectedId)) === true ? String(selectedId) : null;
  const r = captureLy * (K > 0 ? K : 1);
  let best = null, bestD = Infinity;
  for (const s of stars ?? []) {
    if (!s || s.id == null || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const d = Math.hypot(s.x - (target?.x ?? 0), s.z - (target?.z ?? 0));
    if (d > r || d >= bestD) continue;
    if (enterable(String(s.id)) !== true) continue;
    best = String(s.id); bestD = d;
  }
  return best;
}

/** Nawiasy ⌜⌟ celu nurkowania: od `BRACKET_NOTCHES` ostatnich ząbków nad podłogą galaktyki. */
export function diveBracketsVisible(targetDist, minDist) {
  if (!(minDist > 0) || !Number.isFinite(targetDist)) return false;
  return targetDist <= minDist / Math.pow(GALAXY_ZOOM.IN, GALAXY_GESTURE.BRACKET_NOTCHES) + 1e-6;
}
