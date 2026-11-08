// SemanticZoomLogic — ZOOM SEMANTYCZNY sceny bitwy (ARC COMBAT VISUALS, krok CV-3a1; D-CV-3 (a)).
//
// ⚠ ZERO IMPORTÓW — wykonywalne pod node (keeper sprawdza monotoniczność wykonaniem).
//
// Scena nie jest trybem: stopień ściśnięcia bitwy wynika z tego, jak duża jest fregata na ekranie przy obecnym dystansie
// kamery do środka bitwy. Poniżej 4 px (kadr układu, auto-fokus ≤ 6 j. ≈ 2,7 px) bitwa jest w skali prawdziwej; między
// 4 a 24 px statki zbierają się ku scenie, gdy kamera nurkuje (bitwa na ekranie zostaje mniej więcej tej samej wielkości —
// „focus pull”); powyżej 24 px (≈ 0,67 j. przy wysokości okna 1041 px i FOV 55°) cała bitwa jest na scenie (kino).
// rysowane = lerp(bez sceny, scena, blend) — monotoniczne dla każdego `blend`.
//
// Jednostki: [j.] — jednostki świata 3D; [px] — piksele CSS okna.

/** Progi zoomu semantycznego [px] — rozmiar fregaty na ekranie. */
export const SEMANTIC_ZOOM = Object.freeze({
  PX_LO: 4,     // [px] poniżej — skala prawdziwa
  PX_HI: 24,    // [px] powyżej — pełna scena
});

/** Ile px ekranu ma 1 j. świata w głębi `depth` [j.] (FOV pionowy `fovDeg`, wysokość okna `H` px). */
export function pxPerWorld({ depth, fovDeg, H }) {
  if (!(depth > 0) || !(H > 0) || !(fovDeg > 0)) return 0;
  return H / (2 * depth * Math.tan((fovDeg * Math.PI / 180) / 2));
}

/** Długość `length` [j.] na ekranie [px] w głębi `depth`. */
export function lengthPx({ length, depth, fovDeg, H }) {
  return (length > 0 ? length : 0) * pxPerWorld({ depth, fovDeg, H });
}

/** smoothstep(lo, hi, x) ∈ [0, 1]. */
export function smoothstep(lo, hi, x) {
  if (!(hi > lo)) return x >= hi ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** Stopień sceny z rozmiaru fregaty na ekranie [px]: 0 — skala prawdziwa, 1 — pełna scena. Niezdefiniowane — 0. */
export function stageBlend(pxL, lo = SEMANTIC_ZOOM.PX_LO, hi = SEMANTIC_ZOOM.PX_HI) {
  if (!Number.isFinite(pxL)) return 0;
  return smoothstep(lo, hi, pxL);
}

/** Dystans kamery [j.], przy którym fregata ma na ekranie `px` px (odwrotność `lengthPx`). */
export function depthForPx({ length, px, fovDeg, H }) {
  if (!(length > 0) || !(px > 0) || !(H > 0)) return Infinity;
  return length * H / (2 * px * Math.tan((fovDeg * Math.PI / 180) / 2));
}
