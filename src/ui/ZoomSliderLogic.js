// ZoomSliderLogic — ARKUSZ UI U4-4 (UI_PLAN §4.5, decyzja (d)): czysta matematyka suwaka zoomu na pasie dolnym.
// Node-importowalna (bez canvas / three) → smoke-testowalna. Widok w `BottomControlBar`.
//
// Skala LOGARYTMICZNA dystansu kamery od jej celu (`_targetDist` kontrolera kamery), LEWO = DALEKO: pozycja 0 (lewy
// koniec toru) = najdalej (`maxDist`, sufit kontrolera — 450), 1 (prawy koniec) = najbliżej (`minDist` — podłoga jedzie
// z fokusem kamery: `setMinDist`). Zakres podaje wołający; moduł nie zna kamery.

/**
 * Dystans → pozycja na torze 0..1 (0 = lewy koniec = daleko). Dystans poza zakresem — klamra.
 * @param {number} dist @param {number} minDist @param {number} maxDist
 * @returns {number}
 */
export function distToPos(dist, minDist, maxDist) {
  if (!(minDist > 0) || !(maxDist > minDist) || !Number.isFinite(dist)) return 0;
  const d = Math.max(minDist, Math.min(maxDist, dist));
  return Math.log(maxDist / d) / Math.log(maxDist / minDist);
}

/**
 * Pozycja na torze 0..1 → dystans (log); pozycja poza torem — klamra.
 * @param {number} pos @param {number} minDist @param {number} maxDist
 * @returns {number}
 */
export function posToDist(pos, minDist, maxDist) {
  if (!(minDist > 0) || !(maxDist > minDist)) return maxDist;
  const p = Math.max(0, Math.min(1, Number.isFinite(pos) ? pos : 0));
  return maxDist * Math.pow(minDist / maxDist, p);
}

/** Piksel x → pozycja na torze 0..1 (klamra). @param {number} x @param {number} trackX @param {number} trackW */
export function xToPos(x, trackX, trackW) {
  return trackW > 0 ? Math.max(0, Math.min(1, (x - trackX) / trackW)) : 0;
}

/** Pozycja na torze 0..1 → piksel x. @param {number} pos @param {number} trackX @param {number} trackW */
export function posToX(pos, trackX, trackW) {
  return trackX + Math.max(0, Math.min(1, pos)) * trackW;
}
