// uv — rasteryzacja obszaru UV siatki na teksturze (ARC COMBAT VISUALS, krok CV-1b; plan §2.11). Czyste funkcje, ZERO
// zależności (keeper wykonuje je na syntetycznych trójkątach).
//
// Konwencja glTF: współrzędna UV (0, 0) = LEWY GÓRNY róg obrazu (bez odwracania v). Teksel (x, y) należy do obszaru UV,
// gdy jego ŚRODEK (x + 0,5, y + 0,5) leży w którymś trójkącie (na krawędzi też) — ta sama reguła co pomiar CV-1a (fixture
// `CV1a-incoming-key-colour`, „rasteryzacja UV, środek teksela"). Współrzędne poza [0; 1] zawijamy (próbnik REPEAT).

/**
 * Maska obszaru UV: 1 = teksel pokryty trójkątem siatki.
 * @param {ArrayLike<number>} uv — płaska tablica uv (2 na wierzchołek)
 * @param {ArrayLike<number>|null} indices — indeksy trójkątów (null = trójkąty kolejno)
 * @param {number} W @param {number} H — wymiary tekstury (teksele)
 * @returns {Uint8Array} W·H
 */
export function rasterizeUvCoverage(uv, indices, W, H) {
  const mask = new Uint8Array(W * H);
  const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(uv.length / 6);
  const at = (t, k) => (indices ? indices[t * 3 + k] : t * 3 + k);
  for (let t = 0; t < triCount; t++) {
    const a = at(t, 0), b = at(t, 1), c = at(t, 2);
    const x0 = uv[a * 2] * W, y0 = uv[a * 2 + 1] * H;
    const x1 = uv[b * 2] * W, y1 = uv[b * 2 + 1] * H;
    const x2 = uv[c * 2] * W, y2 = uv[c * 2 + 1] * H;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (!Number.isFinite(area) || Math.abs(area) < 1e-12) continue;   // trójkąt zdegenerowany w UV — nic nie pokrywa
    const sgn = area > 0 ? 1 : -1;
    const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5;
        const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * sgn;
        const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * sgn;
        const w2 = ((x0 - cx) * (y1 - cy) - (x1 - cx) * (y0 - cy)) * sgn;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const tx = ((px % W) + W) % W, ty = ((py % H) + H) % H;
        mask[ty * W + tx] = 1;
      }
    }
  }
  return mask;
}

/** Liczba pokrytych tekseli. */
export function coveredCount(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}
