// HudProjection — ARKUSZ HUD H1 (D-HUD-1 (a); HUD_PLAN.md §4.2): JEDEN wspólny projektor warstwy HUD 2D. Punkt i okrąg
// w płaszczyźnie ekliptyki (jednostki świata 3D, „j.”) → px LOGICZNE UI (skala jak `#ui-canvas`: px CSS / `UI_SCALE`).
// Rachunek = `THREE.Vector3.project(camera)` + przeliczenie NDC → okno z `ThreeRenderer.getBodyScreenPosition`; głębia jak
// `ThreeRenderer._viewDepth` (−z w przestrzeni widoku). Czysty: bez three i bez DOM — macierze kamery (kolumnowe, jak
// `THREE.Matrix4.elements`), wymiary okna i skalę świata podaje `ThreeRenderer.getHudView()`.
//   • okrąg: próbki w świecie — oś X świata = oś x układu, oś Z świata = oś y układu, więc kąt 0 = oś x układu (ramka
//     układu, nie kamery); odcinki za płaszczyzną bliską kamery przycinane w przestrzeni widoku (pierścień większy niż
//     kadr — część za kamerą znika, reszta zostaje ciągła);
//   • px na jednostkę świata w danej głębi (tarcza ciała, odstęp echa pingu) — z macierzy rzutu, więc zgodnie z FOV
//     i przesunięciem widoku (`setViewOffset` podglądu obserwatorium).

// [j.] najmniejsza głębia próbki przed kamerą — kamera ma near 0,001, mniejsza głębia dawałaby współrzędne ~10⁶ px.
export const HUD_NEAR_CLIP = 0.01;

/**
 * Projektor z widoku kamery.
 * @param {{view:number[], proj:number[], cssW:number, cssH:number, uiScale?:number, worldPerAU?:number}} v —
 *   `view` = `camera.matrixWorldInverse.elements`, `proj` = `camera.projectionMatrix.elements` (16 liczb, kolumnowo)
 * @returns {object|null} `null`, gdy brak macierzy albo okna
 */
export function makeHudProjector(v) {
  if (!v || !v.view || !v.proj || !(v.cssW > 0) || !(v.cssH > 0)) return null;
  const V = Array.from(v.view);
  const P = Array.from(v.proj);
  if (V.length !== 16 || P.length !== 16) return null;
  const s = v.uiScale > 0 ? v.uiScale : 1;
  const W = v.cssW / s, H = v.cssH / s;                   // okno w px logicznych
  const focal = (P[5] * v.cssH) / 2 / s;                  // px logiczne × głębia [j.] na 1 j. świata

  const toView = (x, y, z, o) => {
    o[0] = V[0] * x + V[4] * y + V[8] * z + V[12];
    o[1] = V[1] * x + V[5] * y + V[9] * z + V[13];
    o[2] = V[2] * x + V[6] * y + V[10] * z + V[14];
    return o;
  };
  // Przestrzeń widoku → px logiczne (perspektywa: w = P·[x y z 1]).
  const viewToScreen = (vx, vy, vz, o) => {
    const cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12];
    const cy = P[1] * vx + P[5] * vy + P[9] * vz + P[13];
    const cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15];
    o[0] = ((cx / cw) * 0.5 + 0.5) * W;
    o[1] = (-(cy / cw) * 0.5 + 0.5) * H;
    return o;
  };
  const tv = [0, 0, 0], ts = [0, 0];

  return {
    W, H, uiScale: s,
    worldPerAU: Number.isFinite(v.worldPerAU) ? v.worldPerAU : null,

    /** Głębia punktu w przestrzeni widoku [j.] (jak `_viewDepth`); ujemna — za kamerą. */
    depth(x, y, z) { return -toView(x, y, z, tv)[2]; },

    /** Punkt świata → `{ x, y, depth }` (px logiczne) albo `null` (za płaszczyzną bliską kamery). `near` — próg głębi
     *  (domyślnie `HUD_NEAR_CLIP`; paczka A, karta 493: kotwica obiektu bliżej niż 0,01 j. — podłoga zoomu stacji 0,005 j.). */
    point(x, y, z, near = HUD_NEAR_CLIP) {
      toView(x, y, z, tv);
      if (-tv[2] < near) return null;
      viewToScreen(tv[0], tv[1], tv[2], ts);
      return { x: ts[0], y: ts[1], depth: -tv[2] };
    },

    /** Px logiczne na 1 j. świata w głębi `depth` (tarcza ciała = 2 · r · pxPerWorld). */
    pxPerWorld(depth) { return depth > 0 ? focal / depth : Infinity; },

    /**
     * Łuk okręgu w płaszczyźnie y = `cy` (środek `cx, cz`, promień `r` j.) od kąta `a0` do `a1` (rad, ramka układu).
     * @returns {{ runs: number[][], maxR: number, clipped: boolean, center: object|null }} — `runs`: ciągłe odcinki
     *   łamanej [x0, y0, x1, y1, …] (px logiczne); `maxR` — największa odległość próbki od rzutu środka (∞, gdy
     *   środek albo część okręgu za kamerą)
     */
    arc(cx, cy, cz, r, segments, a0 = 0, a1 = Math.PI * 2) {
      const n = Math.max(2, Math.ceil(segments));
      const center = this.point(cx, cy, cz);
      const runs = [];
      let run = null, clipped = false, maxR2 = 0;
      const prev = [0, 0, 0], cur = [0, 0, 0], sc = [0, 0];
      let prevVis = false;
      const push = (vx, vy, vz) => {
        viewToScreen(vx, vy, vz, sc);
        run.push(sc[0], sc[1]);
        if (center) { const dx = sc[0] - center.x, dy = sc[1] - center.y; const d2 = dx * dx + dy * dy; if (d2 > maxR2) maxR2 = d2; }
      };
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n);
        toView(cx + r * Math.cos(a), cy, cz + r * Math.sin(a), cur);
        const vis = -cur[2] >= HUD_NEAR_CLIP;
        if (i === 0) {
          if (vis) { run = []; push(cur[0], cur[1], cur[2]); } else clipped = true;
        } else if (vis && prevVis) {
          push(cur[0], cur[1], cur[2]);
        } else if (vis !== prevVis) {
          // Przecięcie odcinka z płaszczyzną z = −HUD_NEAR_CLIP (przestrzeń widoku).
          clipped = true;
          const t = (-HUD_NEAR_CLIP - prev[2]) / (cur[2] - prev[2]);
          const ix = prev[0] + (cur[0] - prev[0]) * t, iy = prev[1] + (cur[1] - prev[1]) * t;
          if (prevVis) { push(ix, iy, -HUD_NEAR_CLIP); if (run.length >= 4) runs.push(run); run = null; }
          else { run = []; push(ix, iy, -HUD_NEAR_CLIP); push(cur[0], cur[1], cur[2]); }
        } else {
          clipped = true;
        }
        prev[0] = cur[0]; prev[1] = cur[1]; prev[2] = cur[2]; prevVis = vis;
      }
      if (run && run.length >= 4) runs.push(run);
      return { runs, maxR: (!center || clipped) ? Infinity : Math.sqrt(maxR2), clipped, center };
    },
  };
}
