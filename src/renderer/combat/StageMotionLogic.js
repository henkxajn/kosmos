// StageMotionLogic — RUCH SCENY BITWY CIĄGŁY W PRĘDKOŚCI (ARC COMBAT VISUALS, krok CV-6b; zgłoszenie właściciela 2026-11-09:
// „bitwy się zacinają” — runda ze strzałami szarpie, potem płynniejsza runda, a na granicy rund widoczna pauza).
//
// ⚠ ZERO IMPORTÓW — wykonywalne pod node (keeper sprawdza ciągłość wykonaniem).
//
// Pomiar w grze (10 na 10, kino i średni zoom, RTX 3070) przed tą zmianą: przejście sceny liczone LINIOWO od celu
// wyświetlanego do nowego rozwiązania przez `combatRoundMs` kończyło się 1–2 klatki PRZED następną rundą (rundy co ~1013 ms
// czasu realnego) — przesunięcia stawały (prędkość 0,00), a następna runda ruszała z nową prędkością skokiem; pęd bitwy jechał
// na ruchu płynnym logiki (cele co ~150 ms tików fizyki, koniec ruchu przed kolejnym celem). Tu każdy statek ma ODCINEK
// sześcienny Hermite'a od pozycji i prędkości wyświetlanej (ciągłość C1) do nowego rozwiązania z prędkością końcową = prędkość
// celu z rundy na rundę; po końcu odcinka statek jedzie dalej tą prędkością, łagodnie gasnącą (bez zatrzymania, gdy runda
// spóźnia się o kilkanaście ms; bez ucieczki w nieskończoność, gdy rundy ustają). Czas — zegar prezentacji (pauza = pauza).
//
// Jednostki: pozycje [j.] (w układzie wołającego: świat albo ciało skorupy), prędkości [j./ms], czasy [ms].

/** Pokrętła ruchu sceny. */
export const STAGE_MOTION = Object.freeze({
  // Stała gaśnięcia prędkości po końcu odcinka, w długościach odcinka: przesunięcie po końcu → v1 · E · (1 − e^(−τ/E)),
  // prędkość v1 · e^(−τ/E) (ciągła w τ = 0). Runda spóźniona o 13 ms przy E = 0,5 rundy — prędkość 97 % v1.
  EXTRAP_E: 0.5,
});

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const vec = (p) => ({ x: Number.isFinite(p?.x) ? p.x : 0, y: Number.isFinite(p?.y) ? p.y : 0, z: Number.isFinite(p?.z) ? p.z : 0 });

/**
 * Odcinek ruchu: od (p0, v0) do (p1, v1) w czasie `durMs`.
 * @param {{p0:{x,y,z}, v0?:{x,y,z}, p1:{x,y,z}, v1?:{x,y,z}, durMs:number}} o
 */
export function motionSegment({ p0, v0 = ZERO, p1, v1 = ZERO, durMs }) {
  return { p0: vec(p0), v0: vec(v0), p1: vec(p1), v1: vec(v1), dur: Number.isFinite(durMs) && durMs > 1 ? durMs : 1 };
}

/**
 * Pozycja i prędkość odcinka po `elMs` od jego początku: do końca odcinka — sześcienny Hermite (pozycja i prędkość ciągłe na
 * obu końcach); po końcu — prędkość końcowa gasnąca wykładniczo (`STAGE_MOTION.EXTRAP_E` długości odcinka).
 * @returns {{ p:{x,y,z}, v:{x,y,z} }} prędkość w [j./ms]
 */
export function motionAt(seg, elMs, { extrapE = STAGE_MOTION.EXTRAP_E } = {}) {
  const T = seg.dur;
  const el = Number.isFinite(elMs) && elMs > 0 ? elMs : 0;
  if (el >= T) {
    const E = Math.max(1e-6, extrapE * T), tau = el - T;
    const k = Math.exp(-tau / E), dist = E * (1 - k);
    return {
      p: { x: seg.p1.x + seg.v1.x * dist, y: seg.p1.y + seg.v1.y * dist, z: seg.p1.z + seg.v1.z * dist },
      v: { x: seg.v1.x * k, y: seg.v1.y * k, z: seg.v1.z * k },
    };
  }
  const s = el / T, s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  // pochodne po s (prędkość = pochodna / T)
  const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  const ax = (k0, k1, k2, k3, c) => k0 * seg.p0[c] + k1 * T * seg.v0[c] + k2 * seg.p1[c] + k3 * T * seg.v1[c];
  return {
    p: { x: ax(h00, h10, h01, h11, 'x'), y: ax(h00, h10, h01, h11, 'y'), z: ax(h00, h10, h01, h11, 'z') },
    v: { x: ax(d00, d10, d01, d11, 'x') / T, y: ax(d00, d10, d01, d11, 'y') / T, z: ax(d00, d10, d01, d11, 'z') / T },
  };
}

/** Prędkość celu z dwóch kolejnych celów odległych o `dtMs` [j./ms]; brak poprzedniego celu — zero. */
export function targetVelocity(p1, pPrev, dtMs) {
  if (!pPrev || !(dtMs > 0)) return { x: 0, y: 0, z: 0 };
  return { x: (p1.x - pPrev.x) / dtMs, y: ((p1.y ?? 0) - (pPrev.y ?? 0)) / dtMs, z: (p1.z - pPrev.z) / dtMs };
}
